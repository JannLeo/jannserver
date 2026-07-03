// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getRepoById, syncRepo } from '@/lib/repos';

// POST /api/repos/:id/sync
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const repo = getRepoById(id);
    if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const result = await syncRepo(id, repo.localPath!, repo.url!, repo.branch!);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}