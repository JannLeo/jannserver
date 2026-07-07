// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { collectDailySummaryContext, buildSummarySystemPrompt } from '@/lib/summary';
import { getTodayLocalDate } from '@/lib/activity';
import { db, initDb } from '@/lib/db/index';
import { dailyPages } from '@/lib/db/schema';
import { writeMarkdown, readMarkdown } from '@/lib/storage';
import { updateFts } from '@/lib/search';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_SUMMARY_RE = /## AI 总结[\s\S]*?(?=\n## |$)/;

const DEFAULT_DAILY_TEMPLATE = `# {{date}}

## 今日重点
-

## 今日任务
- [ ]

## 今日备忘
-

## 今日完成
-

## 今日问题
-

## 明日跟进
-
`;

/**
 * 使用 http.request 绕过 HTTP_PROXY 对 127.0.0.1 的拦截。
 */
async function callAiTranslate(
  aiBaseUrl: string,
  aiApiKey: string,
  aiModel: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs = 120000
): Promise<{ answer: string; error?: string }> {
  return new Promise((resolve) => {
    const url = new URL(`${aiBaseUrl}/chat/completions`);
    const proxy = process.env.HTTP_PROXY;
    let hostname = url.hostname;
    let port = url.port || (url.protocol === 'https:' ? '443' : '80');
    let path = url.pathname + url.search;
    if (proxy && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
      try {
        const proxyUrl = new URL(proxy);
        hostname = proxyUrl.hostname;
        port = proxyUrl.port || (proxyUrl.protocol === 'https:' ? '443' : '80');
        path = `${url.protocol}//${url.host}${url.pathname}${url.search}`;
      } catch { /* ignore */ }
    }
    const body = JSON.stringify({ model: aiModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3 });
    let request: http.ClientRequest;
    const timeout = setTimeout(() => { request?.destroy(); resolve({ answer: 'AI 请求超时（120s）', error: 'timeout' }); }, timeoutMs);
    request = http.request({
      hostname, port, path,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json', 'Host': url.host, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      clearTimeout(timeout);
      if (res.statusCode !== 200) { resolve({ answer: `AI API 返回 ${res.statusCode}`, error: `http_${res.statusCode}` }); res.resume(); return; }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ answer: parsed.choices?.[0]?.message?.content || 'AI 返回为空' });
        } catch { resolve({ answer: `AI 返回解析失败`, error: 'parse_error' }); }
      });
    });
    request.on('error', (err) => { clearTimeout(timeout); resolve({ answer: `AI 请求失败: ${err.message}`, error: err.message }); });
    request.write(body);
    request.end();
  });
}

/**
 * 生成 AI 日总结并保存到 daily note，自动跳过已生成
 */
export async function POST(req: NextRequest) {
  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  const aiApiKey = (process.env.AI_API_KEY || '').trim();
  const aiModel = (process.env.AI_MODEL || '').trim();

  if (!aiBaseUrl || !aiApiKey || !aiModel) {
    return NextResponse.json({ configured: false, error: 'AI 未配置' });
  }

  let date: string;
  try {
    const body = await req.json();
    date = (body.date || '').trim() || getTodayLocalDate();
  } catch {
    date = getTodayLocalDate();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date 必须为 YYYY-MM-DD 格式' }, { status: 400 });
  }

  initDb();

  // 1. Check if already has AI summary
  let dailyRow = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();
  let dailyContent = '';

  if (dailyRow) {
    dailyContent = readMarkdown(dailyRow.filePath || '');
    if (!dailyContent) dailyContent = '';
    if (/^##\s*AI\s*总结/m.test(dailyContent) && !req.headers.get('x-regenerate')) {
      return NextResponse.json({ ok: true, skipped: true, message: '今日已生成日总结', content: dailyContent, date });
    }
    if (/^##\s*AI\s*总结/m.test(dailyContent)) {
      dailyContent = dailyContent.replace(AI_SUMMARY_RE, '').trim();
    }
  } else {
    const id = uuidv4();
    const filePath = `daily/${date}.md`;
    const template = DEFAULT_DAILY_TEMPLATE.replace('{{date}}', date);
    writeMarkdown(filePath, template);
    const now = new Date().toISOString();
    db.insert(dailyPages).values({ id, date, filePath, createdAt: now, updatedAt: now }).run();
    dailyRow = { id, date, filePath, createdAt: now, updatedAt: now } as any;
    dailyContent = template;
    await updateFts('daily', id, `Daily ${date}`, template);
  }

  // 2. 收集上下文并调用 AI
  try {
    const { sources, prompt } = await collectDailySummaryContext(date);
    const systemPrompt = buildSummarySystemPrompt();
    const { answer, error } = await callAiTranslate(aiBaseUrl, aiApiKey, aiModel, systemPrompt, prompt);
    if (error) {
      return NextResponse.json({ ok: false, error: answer, date, sources }, { status: 502 });
    }
    const markdown = answer;

    // 3. 保存 — 直接用 AI 生成结果替换模板内容，避免重复
    writeMarkdown(dailyRow!.filePath || '', markdown.trim());
    db.update(dailyPages).set({ updatedAt: new Date().toISOString() }).where(eq(dailyPages.date, date)).run();
    await updateFts('daily', dailyRow!.id, `Daily ${date}`, markdown.trim());

    return NextResponse.json({ ok: true, skipped: false, date, content: markdown.trim() });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `生成日报失败: ${err.message || String(err)}` }, { status: 500 });
  }
}