// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getRepoById, deleteRepo } from '@/lib/repos';

// GET /api/repos/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const repo = getRepoById(id);
    if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(repo);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/repos/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const repo = getRepoById(id);
    if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    deleteRepo(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}