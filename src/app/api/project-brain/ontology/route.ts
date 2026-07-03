import { NextRequest, NextResponse } from 'next/server';
import { buildProjectOntology, getOntologySummary } from '@/lib/projectOntology';
import { getProjectContext } from '@/lib/projectBrain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { repoName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 });
  }

  const repoName = typeof body.repoName === 'string' ? body.repoName.trim() : '';
  if (!repoName) return NextResponse.json({ error: 'repoName 是必填项' }, { status: 400 });

  const ctx = getProjectContext(repoName);
  if (!ctx) {
    return NextResponse.json(
      {
        ok: false,
        error: `repo not found or path invalid: ${repoName}`,
        hint: '请先在 /repos 添加该 repo 并完成一次同步',
      },
      { status: 404 }
    );
  }

  try {
    const result = await buildProjectOntology(repoName);
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const repoName = (url.searchParams.get('repoName') || '').trim();
  if (!repoName) {
    return NextResponse.json({ error: 'repoName 是必填项' }, { status: 400 });
  }

  const ctx = getProjectContext(repoName);
  if (!ctx) {
    return NextResponse.json(
      {
        ok: false,
        error: `repo not found or path invalid: ${repoName}`,
        hint: '请先在 /repos 添加该 repo 并完成一次同步',
      },
      { status: 404 }
    );
  }

  const summary = getOntologySummary(ctx.repoId, ctx.repoName);
  return NextResponse.json({ ok: true, ...summary });
}
