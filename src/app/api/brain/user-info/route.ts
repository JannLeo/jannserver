// @ts-nocheck
import { NextResponse } from 'next/server';
import { getBrainStatus } from '@/lib/brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getBrainStatus();
  return NextResponse.json({ ok: true, userInfo: status.userInfo });
}
