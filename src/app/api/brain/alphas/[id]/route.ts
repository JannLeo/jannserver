// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAlphaFromDb } from '@/lib/brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const alpha = getAlphaFromDb(params.id);
  if (!alpha) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, alpha });
}
