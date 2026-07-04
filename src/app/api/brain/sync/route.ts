// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { syncBrainAlphas } from '@/lib/brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  try {
    const result = await syncBrainAlphas();
    if (!result.ok) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
