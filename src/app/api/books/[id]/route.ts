import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { books, readingProgress, bookHighlights } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// GET /api/books/[id] — get book + progress + highlight count
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const { id } = await params;

  const book = db.select().from(books).where(eq(books.id, id)).get();
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const progress = db.select().from(readingProgress)
    .where(eq(readingProgress.bookId, id))
    .get();

  const highlightCount = db.select().from(bookHighlights)
    .where(eq(bookHighlights.bookId, id))
    .all().length;

  return NextResponse.json({ book, progress, highlightCount });
}

// DELETE /api/books/[id] — remove book from library
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const { id } = await params;

  // Delete highlights first (no CASCADE on SQLite easily)
  db.delete(bookHighlights).where(eq(bookHighlights.bookId, id)).run();
  db.delete(readingProgress).where(eq(readingProgress.bookId, id)).run();
  db.delete(books).where(eq(books.id, id)).run();

  return NextResponse.json({ ok: true });
}