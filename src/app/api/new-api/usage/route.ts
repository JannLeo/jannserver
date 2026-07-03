// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getNewApiUsage } from '@/lib/newApiUsage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_RANGES = ['today', '7d', '30d'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const rangeParam = (req.nextUrl.searchParams.get('range') || '7d').trim();
  const dateParam = (req.nextUrl.searchParams.get('date') || '').trim();

  // 参数校验
  let range: 'today' | '7d' | '30d' = '7d';
  if (ALLOWED_RANGES.includes(rangeParam)) {
    range = rangeParam as any;
  } else if (rangeParam) {
    return NextResponse.json({ error: 'range 只允许 today/7d/30d' }, { status: 400 });
  }
  if (dateParam && !DATE_RE.test(dateParam)) {
    return NextResponse.json({ error: 'date 必须为 YYYY-MM-DD 格式' }, { status: 400 });
  }

  try {
    const result = await getNewApiUsage(range, dateParam || undefined);
    return NextResponse.json(result);
  } catch (err: any) {
    // 任何意外错误都不让页面崩溃
    return NextResponse.json({
      configured: true,
      source: 'http_api',
      baseUrl: null,
      summary: null,
      daily: [],
      byModel: [],
      byChannel: [],
      recentLogs: [],
      error: `获取 new-api 使用情况失败: ${err.message}`,
    });
  }
}
