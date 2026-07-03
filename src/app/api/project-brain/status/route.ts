import { NextRequest, NextResponse } from 'next/server';
import { getProjectBrainStatus } from '@/lib/projectBrain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const repoName = (url.searchParams.get('repoName') || '').trim();
  if (!repoName) {
    return NextResponse.json({ error: 'repoName 是必填项' }, { status: 400 });
  }

  const status = getProjectBrainStatus(repoName);
  if (!status) {
    return NextResponse.json(
      {
        ok: false,
        error: `repo not found or path invalid: ${repoName}`,
        hint: '请先在 /repos 添加该 repo 并完成一次同步',
      },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, ...status });
}
