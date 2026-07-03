// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getRepoById } from '@/lib/repos';
import { db } from '@/lib/db/index';
import { repoDocuments } from '@/lib/db/schema';
import { eq, and, like, or } from 'drizzle-orm';

// @ts-ignore
const docT = repoDocuments as any;

// GET /api/repos/:id/documents
// Query params: ?q=keyword&limit=100&offset=0
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const repoId = Number(id);
    if (!repoId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const repo = getRepoById(repoId);
    if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
    const offset = Number(url.searchParams.get('offset')) || 0;

    // Build where conditions
    const conditions = [eq(docT.repoId, repoId)];
    if (q.trim()) {
      const pattern = `%${q.trim()}%`;
      conditions.push(
        or(
          like(docT.title, pattern),
          like(docT.relPath, pattern)
        ) as any
      );
    }

    // Get total count
    const totalRows = db.select().from(repoDocuments).where(and(...conditions)).all();
    const total = totalRows.length;

    // Get paginated items (no content column)
    const items = db.select({
      id: docT.id,
      repoId: docT.repoId,
      filePath: docT.filePath,
      title: docT.title,
      relPath: docT.relPath,
      excerpt: docT.excerpt,
      contentHash: docT.contentHash,
      updatedAt: docT.updatedAt,
    })
      .from(repoDocuments)
      .where(and(...conditions))
      .orderBy(docT.updatedAt)
      .limit(limit)
      .offset(offset)
      .all();

    return NextResponse.json({ items, total, limit, offset });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}