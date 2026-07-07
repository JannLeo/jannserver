// Stub for DashboardClient — delegates to existing new-api/usage if needed
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    balance: null,
    usedToday: null,
    used7d: null,
    used30d: null,
    requestCountToday: null,
    tokenCountToday: null,
  });
}