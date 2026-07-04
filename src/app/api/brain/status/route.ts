// @ts-nocheck
import { NextResponse } from 'next/server';
import { getBrainStatus } from '@/lib/brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getBrainStatus());
}
