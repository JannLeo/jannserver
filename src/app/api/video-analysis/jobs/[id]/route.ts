// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getJobDetail, runJob } from '@/lib/videoAnalysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) return NextResponse.json({ error: '无效的 id' }, { status: 400 });

    const detail = getJobDetail(id);
    if (!detail) return NextResponse.json({ error: '任务不存在' }, { status: 404 });

    return NextResponse.json(detail);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) return NextResponse.json({ error: '无效的 id' }, { status: 400 });

    const result = await runJob(id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
