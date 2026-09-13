// @ts-nocheck
/**
 * /api/ai/trending-analysis
 * 获取热门仓库，AI 分析推荐。AI 解析失败时返回原始 trending 数据。
 * 响应时间目标：<10s
 */
import { NextRequest, NextResponse } from 'next/server';
import http from 'http';

export const dynamic = 'force-dynamic';

async function fetchTrending(since: string): Promise<any[]> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 3002, path: `/api/trending?since=${since}`, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body).repos || []); }
          catch { resolve([]); }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.end();
    setTimeout(() => { req.destroy(); resolve([]); }, 30000);
  });
}

async function callAiWithTimeout(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.2,
    });
    const req = http.request(
      {
        hostname: '127.0.0.1', port: 12345, path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const msg = parsed.choices?.[0]?.message || {};
            const content = msg.content || msg.reasoning_content || '';
            resolve(content);
          }
          catch { resolve(''); }
        });
      }
    );
    req.on('error', () => resolve(''));
    req.write(body);
    req.end();
    setTimeout(() => { req.destroy(); resolve(''); }, 60000);
  });
}

function safeParseJson(text: string): { analysis: string; recommendations: any[] } | null {
  if (!text || text.length < 10) return null;
  try {
    // 方式1：代码块
    const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (blockMatch) {
      const parsed = JSON.parse(blockMatch[1].trim());
      if (parsed?.recommendations) return parsed;
    }
    // 方式2：整个文本是 JSON
    const parsed = JSON.parse(text.trim());
    if (parsed?.recommendations) return parsed;
    // 方式3：找 JSON 对象
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = text.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      if (parsed?.recommendations) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since') || 'daily';
  const skipAi = searchParams.get('skip_ai') === '1';
  const seed = parseInt(searchParams.get('seed') || '0', 10); // 快速模式，跳过 AI

  // 1. 获取 trending
  const repos = await fetchTrending(since);
  if (repos.length === 0) {
    return NextResponse.json({ error: '无法获取趋势数据' }, { status: 500 });
  }

  // 快速模式：直接返回 trending 数据，不做 AI 分析
  if (skipAi) {
    // seed 控制随机顺序，相同 seed 出相同结果
    let shuffled = [...repos];
    if (seed > 0) {
      const rng = (n: number) => Math.abs(Math.sin(seed * 137.508 + n * 73.184)) % 1;
      shuffled.sort((a, b) => rng(shuffled.indexOf(a)) - rng(shuffled.indexOf(b)));
    }
    return NextResponse.json({
      totalRepos: repos.length,
      analysis: '显示每日热门仓库，变化快内容多，请滚动查看。',
      recommendations: shuffled.slice(0, 20).map((r: any) => ({
        name: r.name,
        fullName: r.name,
        description: r.description || '',
        language: r.language || '',
        stars: r.stars || '',
        todayStars: r.todayStars || '',
        href: r.href,
        reason: '热门仓库，待评估',
        integrationSteps: '需手动分析',
        complexity: 'medium',
        effortHours: 3,
      })),
      fetchedAt: new Date().toISOString(),
    });
  }

  // 2. AI 分析（30s 超时）
  const apiKey = (process.env.AI_API_KEY || '').trim();
  const model = (process.env.AI_MODEL || 'gpt-5.5').trim();
  if (!apiKey) return NextResponse.json({ error: 'AI 未配置' }, { status: 500 });

  const repoList = repos.slice(0, 12).map(r =>
    `**${r.name}** | ${r.language || 'N/A'} | ${r.todayStars || r.stars || '?'}\n   ${(r.description || '（无描述）').slice(0, 150)}`
  ).join('\n\n');

  const systemPrompt = `你是 Jann 的个人 AI 助理，专门评估 GitHub 仓库是否值得整合到个人工作台。

**工作台技术栈：** Next.js 14 (App Router) + TypeScript + Tailwind CSS + SQLite (better-sqlite3)
**已有功能：** 任务管理、笔记、GitHub 仓库同步、Wiki、AI 问答、新闻聚合、视频分析、自学课程、小说创作、量化分析（WorldQuant BRAIN）、TailSSH 终端、代码搜索

**筛选标准（优先满足）：**
1. 技术栈匹配（Next.js/React/TypeScript/Node.js 优先）
2. 能作为独立模块嵌入或增强现有工作台
3. 开发效率工具、API 工具、自动化脚本
4. 有学习价值的优质开源项目
5. 与现有功能互补

**输出格式：严格纯 JSON（无 markdown 无其他文字）**
{"analysis":"整体分析（50字内）","recommendations":[{"name":"owner/repo","description":"描述","language":"语言","stars":"数字","todayStars":"格式化stars","href":"/owner/repo","reason":"为什么适合（40字内）","integrationSteps":"整合步骤（80字内）","complexity":"low|medium|high","effortHours":1-8}]}`;

  const userPrompt = `GitHub 热门仓库列表（本周 stars 最高）：

${repoList}

请筛选最多 5 个最适合整合到 Jann 个人工作台的仓库，输出纯 JSON。`;

  const rawResponse = await callAiWithTimeout(apiKey, model, systemPrompt, userPrompt);
  let analysis = '';
  let recommendations: any[] = [];
  let aiAnalysisSuccess = false;

  if (rawResponse) {
    const parsed = safeParseJson(rawResponse);
    if (parsed && parsed.recommendations?.length > 0) {
      aiAnalysisSuccess = true;
      analysis = parsed.analysis || '';
      recommendations = parsed.recommendations.map((r: any) => ({
        name: r.name || '',
        fullName: r.fullName || r.name || '',
        description: r.description || '',
        language: r.language || '',
        stars: r.stars || '',
        todayStars: r.todayStars || '',
        href: r.href || (r.name ? `/${r.name}` : ''),
        reason: r.reason || '',
        integrationSteps: r.integrationSteps || '',
        complexity: r.complexity || 'medium',
        effortHours: Number(r.effortHours) || 2,
      }));
    }
  }

  // AI 解析失败 → 用原始 trending 数据
  if (recommendations.length === 0) {
    analysis = analysis || 'AI 分析未完成，显示今日热门仓库供手动评估。';
    recommendations = repos.slice(0, 20).map((r: any) => ({
      name: r.name,
      fullName: r.name,
      description: r.description || '',
      language: r.language || '',
      stars: r.stars || '',
      todayStars: r.todayStars || '',
      href: r.href,
      reason: '热门仓库，待评估',
      integrationSteps: '需手动分析',
      complexity: 'medium' as const,
      effortHours: 3,
    }));
  }

  return NextResponse.json({
    totalRepos: repos.length,
    analysis,
    recommendations,
    aiAnalyzed: aiAnalysisSuccess,
    fetchedAt: new Date().toISOString(),
  });
}