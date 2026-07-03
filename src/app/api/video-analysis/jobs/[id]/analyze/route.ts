// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { analyzeJob } from '@/lib/videoAnalysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const parts = req.nextUrl.pathname.split('/');
    const id = parseInt(parts[parts.length - 2], 10); // [id]/analyze
    if (isNaN(id)) return NextResponse.json({ error: '无效的 id' }, { status: 400 });

    const result = await analyzeJob(id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, jobId: id, markdown: result.markdown });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
