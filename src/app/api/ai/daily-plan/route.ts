// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { collectDailyPlanContext, buildPlanSystemPrompt, parsePlanResponse } from '@/lib/planning';
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
  let userHint = '';
  try {
    const body = await req.json();
    date = (body.date || '').trim() || getTodayLocalDate();
    userHint = typeof body.userHint === 'string' ? body.userHint.trim() : '';
  } catch {
    date = getTodayLocalDate();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date 必须为 YYYY-MM-DD 格式' }, { status: 400 });
  }

  try {
    const { sources, prompt } = await collectDailyPlanContext(date, userHint);
    const systemPrompt = buildPlanSystemPrompt();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let rawContent = '';
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
          temperature: 0.4,
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
      rawContent = data.choices?.[0]?.message?.content || '';
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

    if (!rawContent.trim()) {
      return NextResponse.json({
        configured: true,
        date,
        error: 'AI 返回为空',
        sources,
      }, { status: 502 });
    }

    // 解析 AI 返回的 JSON（容错：失败则把原文当 markdown）
    const { markdown, suggestedTasks } = parsePlanResponse(rawContent);

    return NextResponse.json({
      configured: true,
      date,
      markdown,
      suggestedTasks,
      sources,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `生成日计划失败: ${err.message || String(err)}`,
    }, { status: 500 });
  }
}
