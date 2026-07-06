import { NextRequest, NextResponse } from 'next/server';
import { proxyFetch } from '@/lib/proxy-fetch';
import { db, initDb } from '@/lib/db/index';
import { books } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  isbn?: string[];
  subject?: string[];
  publisher?: string[];
  language?: string[];
}

function coverUrl(coverId: number | undefined): string {
  if (!coverId) return '';
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

function bigCoverUrl(coverId: number | undefined): string {
  if (!coverId) return '';
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

// GET /api/books?q=...&type=title isbn
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const type = searchParams.get('type') ?? 'title';

  if (!q.trim()) {
    initDb();
    const all = db.select().from(books).all();
    return NextResponse.json({ results: [], library: all });
  }

  const query = q.trim();
  const limit = 20;
  const url = type === 'isbn'
    ? `https://openlibrary.org/search.json?isbn=${query}&limit=${limit}`
    : `https://openlibrary.org/search.json?q=${query}&limit=${limit}`;

  try {
    const data = await proxyFetch(url) as { docs?: OpenLibraryDoc[] };
    const results = (data.docs ?? []).slice(0, limit).map((doc) => ({
      key: doc.key?.replace('/works/', ''),
      openlibraryKey: doc.key,
      title: doc.title,
      author: (doc.author_name ?? []).join(', '),
      coverId: doc.cover_i,
      coverUrl: coverUrl(doc.cover_i),
      bigCoverUrl: bigCoverUrl(doc.cover_i),
      firstPublishYear: doc.first_publish_year,
      isbn: (doc.isbn ?? [])[0] ?? '',
      subjects: (doc.subject ?? []).slice(0, 5),
      publisher: (doc.publisher ?? [])[0] ?? '',
      language: (doc.language ?? ['en'])[0],
    }));

    initDb();
    const library = db.select().from(books).all();

    return NextResponse.json({ results, library });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Search failed', results: [] },
      { status: 502 }
    );
  }
}

// POST /api/books — add to library
export async function POST(req: NextRequest) {
  initDb();
  const body = await req.json();
  const { id: existingId, title, author, isbn, coverUrl: coverUrl2, epubUrl, description, language, totalPages, source } = body;

  if (!title) return NextResponse.json({ error: '标题必填' }, { status: 400 });

  const id = existingId ?? (isbn?.[0] ? `isbn:${isbn}` : uuidv4());
  const now = new Date().toISOString();

  const existing = db.select().from(books).where(eq(books.id, id)).get();
  if (existing) {
    db.update(books).set({
      title, author, isbn, coverUrl: coverUrl2, epubUrl, description, language,
      updatedAt: now,
    }).where(eq(books.id, id)).run();
  } else {
    db.insert(books).values({
      id, title, author: author ?? '',
      isbn: isbn ?? null,
      coverUrl: coverUrl2 ?? '',
      epubUrl: epubUrl ?? '',
      description: description ?? '',
      language: language ?? 'en',
      totalPages: totalPages ?? null,
      source: source ?? 'openlibrary',
      addedAt: now,
    }).run();
  }

  return NextResponse.json({ id });
}