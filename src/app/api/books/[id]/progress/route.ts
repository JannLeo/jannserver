import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { readingProgress, books } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const DEFAULT_USER = 'default';

// GET /api/books/[id]/progress
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const { id } = await params;

  const prog = db.select().from(readingProgress)
    .where(and(eq(readingProgress.bookId, id), eq(readingProgress.userId, DEFAULT_USER)))
    .get();

  return NextResponse.json(prog ?? { bookId: id, currentCfi: '', currentPage: 0, progressPercent: 0 });
}

// POST /api/books/[id]/progress
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const { id } = await params;
  const { currentCfi, currentPage, progressPercent } = await req.json();

  const now = new Date().toISOString();

  const existing = db.select().from(readingProgress)
    .where(and(eq(readingProgress.bookId, id), eq(readingProgress.userId, DEFAULT_USER)))
    .get();

  if (existing) {
    db.update(readingProgress).set({
      currentCfi: currentCfi ?? existing.currentCfi,
      currentPage: currentPage ?? existing.currentPage,
      progressPercent: progressPercent ?? existing.progressPercent,
      updatedAt: now,
    }).where(eq(readingProgress.id, existing.id)).run();
  } else {
    db.insert(readingProgress).values({
      bookId: id,
      userId: DEFAULT_USER,
      currentCfi: currentCfi ?? '',
      currentPage: currentPage ?? 0,
      progressPercent: progressPercent ?? 0,
      updatedAt: now,
    }).run();
  }

  return NextResponse.json({ ok: true, updatedAt: now });
}