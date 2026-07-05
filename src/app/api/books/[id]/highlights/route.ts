import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { bookHighlights, notes, books } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { writeMarkdown, generateSlug, getExcerpt } from '@/lib/storage';
import { updateFts } from '@/lib/search';

export const dynamic = 'force-dynamic';

// GET /api/books/[id]/highlights
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const { id } = await params;
  const highlights = db.select().from(bookHighlights)
    .where(eq(bookHighlights.bookId, id))
    .orderBy(desc(bookHighlights.createdAt))
    .all();

  return NextResponse.json(highlights);
}

// POST /api/books/[id]/highlights — create highlight, optionally save to Notes too
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const { id } = await params;
  const { cfiRange, chapterHref, highlightedText, note, color, saveToNote } = await req.json();

  if (!highlightedText) {
    return NextResponse.json({ error: '高亮文本必填' }, { status: 400 });
  }

  const now = new Date().toISOString();
  let noteId: string | null = null;

  // If saveToNote is true, create a journal entry in the Notes system
  if (saveToNote) {
    const title = `读书笔记 — ${highlightedText.slice(0, 40)}`;
    const slug = `reading-${generateSlug(title)}-${uuidv4().slice(0, 6)}`;
    const filePath = `notes/${slug}.md`;

    const book = db.select({ title: books.title }).from(books).where(eq(books.id, id)).get();

    const noteContent = [
      `## 📖 读书笔记`,
      ``,
      `**来源**：《${book?.title ?? id}》${chapterHref ? ` · 章节：${chapterHref}` : ''}`,
      ``,
      `> ${highlightedText}`,
      ``,
      note || '',
    ].join('\n');

    const excerpt = getExcerpt(noteContent);
    noteId = uuidv4();

    writeMarkdown(filePath, noteContent);

    db.insert(notes).values({
      id: noteId,
      title,
      slug,
      filePath,
      excerpt,
      isTodoExtracted: false,
      createdAt: now,
      updatedAt: now,
    }).run();

    updateFts('note', noteId, title, excerpt || noteContent);
  }

  const result = db.insert(bookHighlights).values({
    bookId: id,
    cfiRange: cfiRange ?? '',
    chapterHref: chapterHref ?? '',
    highlightedText,
    note: note ?? '',
    noteId,
    color: color ?? 'yellow',
    createdAt: now,
  }).run();

  return NextResponse.json({ id: result.lastInsertRowid, noteId });
}

// DELETE /api/books/[id]/highlights?highlight_id=N
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const { searchParams } = new URL(req.url);
  const highlightId = searchParams.get('highlight_id');
  const all = searchParams.get('all');

  if (all === 'true') {
    db.delete(bookHighlights).where(eq(bookHighlights.bookId, (await params).id)).run();
    return NextResponse.json({ ok: true, deleted: 'all' });
  }

  if (!highlightId) {
    return NextResponse.json({ error: 'highlight_id required' }, { status: 400 });
  }

  db.delete(bookHighlights).where(eq(bookHighlights.id, Number(highlightId))).run();
  return NextResponse.json({ ok: true, deleted: Number(highlightId) });
}