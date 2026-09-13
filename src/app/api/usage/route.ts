// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getNewApiUsage } from '@/lib/newApiUsage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 复用 new-api/usage 的数据，但直接返回 UsageSummary 字段 + ok 标记
    // DashboardClient 期望: { ok, balance, usedToday, used7d, used30d, requestCountToday, tokenCountToday }
    const result = await getNewApiUsage('7d');

    if (result.error && !result.summary) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      balance: result.summary?.balance ?? null,
      usedToday: result.summary?.usedToday ?? null,
      used7d: result.summary?.used7d ?? null,
      used30d: result.summary?.used30d ?? null,
      requestCountToday: result.summary?.requestCountToday ?? null,
      tokenCountToday: result.summary?.tokenCountToday ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}