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

  // 1. 检查是否已有 AI 总结
  let dailyRow = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();
  let dailyContent = '';

  if (dailyRow) {
    dailyContent = readMarkdown(dailyRow.filePath || '');
    if (!dailyContent) dailyContent = '';

    // 如果已有 ## AI 总结，直接返回（不重复生成）
    if (/^##\s*AI\s*总结/m.test(dailyContent)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: '今日已生成日总结',
        content: dailyContent,
        date,
      });
    }
  } else {
    // 自动创建 daily note
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let markdown = '';
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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json({
          ok: false,
          error: `AI API 返回 ${res.status}`,
          date,
        }, { status: 502 });
      }

      const data = await res.json();
      markdown = data.choices?.[0]?.message?.content || 'AI 返回为空';
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        return NextResponse.json({ ok: false, error: 'AI 请求超时（120s）', date }, { status: 504 });
      }
      return NextResponse.json({ ok: false, error: `AI 请求失败: ${err.message}`, date }, { status: 502 });
    }

    // 3. 保存：直接以 AI 生成内容为主，保留模板供手动编辑
    // 如果已有 AI 总结段落则替换，否则在模板前插入（使 AI 总结在最上方）
    let updatedContent: string;
    if (/^##\s*AI\s*总结/m.test(dailyContent)) {
      updatedContent = dailyContent.replace(AI_SUMMARY_RE, `## AI 总结\n\n${markdown.trim()}\n`);
    } else {
      // 把 AI 总结放在模板最前面（作为主要阅读内容），原模板保留供手动填充
      updatedContent = `# ${date}\n\n## AI 总结\n\n${markdown.trim()}\n\n---\n\n${dailyContent.trimStart()}`;
    }
    writeMarkdown(dailyRow!.filePath || '', updatedContent);
    db.update(dailyPages).set({ updatedAt: new Date().toISOString() }).where(eq(dailyPages.date, date)).run();
    await updateFts('daily', dailyRow!.id, `Daily ${date}`, updatedContent);

    return NextResponse.json({
      ok: true,
      skipped: false,
      date,
      content: updatedContent,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: `生成日报失败: ${err.message || String(err)}`,
    }, { status: 500 });
  }
}