// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { listJobs, createJob, CreateJobInput } from '@/lib/videoAnalysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = listJobs(20);
    return NextResponse.json({ jobs });
  } catch (err: any) {
    return NextResponse.json({ jobs: [], error: err.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: CreateJobInput = {
      platform: String(body.platform || '').trim().toLowerCase(),
      crawlType: String(body.crawlType || 'search').trim().toLowerCase(),
      keyword: body.keyword ? String(body.keyword).trim() : '',
      targetUrl: body.targetUrl ? String(body.targetUrl).trim() : '',
      limit: typeof body.limit === 'number' ? body.limit : 5,
      withComments: body.withComments !== false,
    };

    if (!input.platform) {
      return NextResponse.json({ ok: false, error: 'platform 是必填项' }, { status: 400 });
    }

    const jobId = createJob(input);
    return NextResponse.json({ ok: true, jobId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
