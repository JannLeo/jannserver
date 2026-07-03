import { NextRequest, NextResponse } from 'next/server';
import { scanCodeFiles, getProjectContext } from '@/lib/projectBrain';
import { getRepoProfile } from '@/lib/projectBrainConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Outermost safety net: never return non-JSON even on unhandled crash
  try {
    let body: { repoName?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ configured: true, ok: false, reason: '无效的请求体' }, { status: 400 });
    }

    const repoName = typeof body.repoName === 'string' ? body.repoName.trim() : '';
    if (!repoName) return NextResponse.json({ configured: true, ok: false, reason: 'repoName 是必填项' }, { status: 400 });

    const ctx = getProjectContext(repoName);
    if (!ctx) {
      return NextResponse.json(
        {
          configured: true,
          ok: false,
          repoName,
          reason: `repo not found or path invalid: ${repoName}`,
          hint: '请先在 /repos 添加该 repo 并完成一次同步',
        },
        { status: 404 }
      );
    }

    const profile = getRepoProfile(repoName);
    if (profile === 'docs') {
      // docs profile: code scan skipped, only docs in repo_documents
      return NextResponse.json({
        configured: true,
        ok: true,
        repoId: ctx.repoId,
        repoName,
        scanned: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        skippedLargeFiles: 0,
        removed: 0,
        reason: 'docs profile: code scan skipped (docs are in repo_documents)',
      });
    }

    const result = await scanCodeFiles({ repoId: ctx.repoId, repoPath: ctx.repoPath });
    return NextResponse.json({ configured: true, repoName, ...result });
  } catch (err: any) {
    // Catastrophic: db crash, unhandled rejection, etc. — always return valid JSON.
    return NextResponse.json(
      { configured: true, ok: false, reason: `server error: ${String(err?.message || err)}` },
      { status: 500 }
    );
  }
}