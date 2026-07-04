// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { listAlphas } from '@/lib/brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const alphas = listAlphas({ status, limit, offset });
  return NextResponse.json({ ok: true, alphas });
}
