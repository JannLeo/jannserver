// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db, sqlite, initDb } from '@/lib/db/index';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  const aiApiKey = (process.env.AI_API_KEY || '').trim();
  const aiModel = (process.env.AI_MODEL || '').trim();

  if (!aiBaseUrl || !aiApiKey || !aiModel) {
    return NextResponse.json({ analysis: null, error: 'AI 未配置' });
  }

  let tasks: any[] = [];
  try {
    const body = await req.json();
    tasks = Array.isArray(body.tasks) ? body.tasks : [];
  } catch {}

  if (tasks.length === 0) {
    return NextResponse.json({ analysis: '暂无任务' });
  }

  // ── Gather context from summary-for-work + worldquant repos ──────────────
  let workContext = '';
  try {
    initDb();

    // Search wiki_pages for work summaries
    const wikiRows: any[] = sqlite.prepare(`
      SELECT title, content FROM wiki_pages
      WHERE title LIKE '%summary%' OR title LIKE '%work%' OR title LIKE '%worldquant%' OR title LIKE '%WQ%'
         OR content LIKE '%worldquant%' OR content LIKE '%任务分配%'
      ORDER BY RANDOM()
      LIMIT 5
    `).all();

    // Search repo_documents for worldquant
    const repoRows: any[] = sqlite.prepare(`
      SELECT title, content FROM repo_documents
      WHERE repo_name LIKE '%worldquant%' OR repo_name LIKE '%summary-for-work%'
         OR title LIKE '%worldquant%' OR content LIKE '%worldquant%'
      ORDER BY RANDOM()
      LIMIT 5
    `).all();

    const allRows = [...wikiRows, ...repoRows];
    if (allRows.length > 0) {
      workContext = allRows.map(r =>
        `【${r.title || '文档'}】\n${((r.content || '').slice(0, 500))}`
      ).join('\n\n');
    } else {
      // Fallback: search recent daily notes
      const recentDaily = sqlite.prepare(`
        SELECT content FROM daily_pages
        ORDER BY date DESC LIMIT 3
      `).all();
      if (recentDaily.length > 0) {
        workContext = recentDaily.map(r => `[日报片段]\n${((r.content || '').slice(0, 300))}`).join('\n');
      }
    }
  } catch {}

  // ── Build prompt ──────────────────────────────────────────────────────────
  const taskList = tasks.map((t, i) =>
    `[任务${i + 1}] 标题: ${t.title || '(无标题)'} | 优先级: ${t.priority || '普通'} | 状态: ${t.status || 'todo'}`
  ).join('\n');

  const workCtxBlock = workContext ? `\n\n## 相关工作上下文（来自知识库）\n${workContext}` : '';

  const userPrompt = `你是任务优先级分析助手。根据今日任务列表和知识库上下文，给出简洁的优先级建议。\n\n${taskList}\n${workCtxBlock}\n\n请用 1-2 句话总结今日最高优先任务和推荐理由。`;

  // ── Call AI ───────────────────────────────────────────────────────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: '你是专业的任务优先级分析助手。分析简洁直接，1-2句话给出结论。' },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ analysis: null, error: 'AI 请求失败' });
    }

    const data = await res.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() || null;
    return NextResponse.json({ analysis });
  } catch (err: any) {
    clearTimeout(timeout);
    return NextResponse.json({ analysis: null, error: err.message });
  }
}