// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getRepoById, getDocumentsByRepoId } from '@/lib/repos';

// GET /api/repos/:id/documents
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const repo = getRepoById(id);
    if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const docs = getDocumentsByRepoId(id);
    return NextResponse.json(docs);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}