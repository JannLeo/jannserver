// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { collectDailySummaryContext, buildSummarySystemPrompt } from '@/lib/summary';
import { getTodayLocalDate } from '@/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
          configured: true,
          date,
          error: `AI API 返回 ${res.status}`,
          sources,
        }, { status: 502 });
      }

      const data = await res.json();
      markdown = data.choices?.[0]?.message?.content || 'AI 返回为空';
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        return NextResponse.json({
          configured: true,
          date,
          error: 'AI 请求超时（120s）',
          sources,
        }, { status: 504 });
      }
      return NextResponse.json({
        configured: true,
        date,
        error: `AI 请求失败: ${err.message}`,
        sources,
      }, { status: 502 });
    }

    return NextResponse.json({
      configured: true,
      date,
      markdown,
      sources,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `生成日报失败: ${err.message || String(err)}`,
    }, { status: 500 });
  }
}
