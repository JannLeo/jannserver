import { NextResponse } from 'next/server';
import { sqlite } from '@/lib/db/index';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const row = sqlite.prepare('SELECT 1 AS ok').get() as { ok?: number } | undefined;
    if (row?.ok !== 1) throw new Error('SQLite health query returned an unexpected result');

    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      time: Date.now(),
    });
  } catch (error) {
    console.error('[health] database check failed', error);
    return NextResponse.json(
      { status: 'error', database: 'unavailable', time: Date.now() },
      { status: 503 },
    );
  }
}
