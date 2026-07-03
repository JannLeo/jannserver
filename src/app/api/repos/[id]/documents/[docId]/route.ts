// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getRepoById, getDocumentById } from '@/lib/repos';
import * as fs from 'fs';
import * as nodePath from 'path';

// GET /api/repos/:id/documents/:docId
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const id = Number(params.id);
    const docId = Number(params.docId);
    if (!id || !docId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const repo = getRepoById(id);
    if (!repo) return NextResponse.json({ error: 'Repo not found' }, { status: 404 });

    const doc = getDocumentById(docId);
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Verify doc belongs to this repo
    if (doc.repoId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // doc.filePath is already the full absolute path (stored as-is from sync)
    // No need to join with repo.localPath again
    const filePath = doc.filePath!;
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
    }

    return NextResponse.json({ ...doc, content });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}