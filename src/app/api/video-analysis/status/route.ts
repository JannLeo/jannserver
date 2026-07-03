// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getStatus } from '@/lib/videoAnalysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getStatus();
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({
      configured: false,
      serviceReachable: false,
      baseUrl: null,
      error: err.message,
    });
  }
}