import { NextRequest, NextResponse } from 'next/server';
import { getRepoActivity } from '@/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'date 参数必须为 YYYY-MM-DD 格式' },
      { status: 400 }
    );
  }
  try {
    const result = await getRepoActivity(date);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: `获取活动失败: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}
