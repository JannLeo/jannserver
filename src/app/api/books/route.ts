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

interface GoogleBook {
  volumeId: string;
  title: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  imageLinks?: { thumbnail?: string };
  isbn?: string;
  pageCount?: number;
  language?: string;
}

function coverUrl(coverId: number | undefined): string {
  if (!coverId) return '';
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

function bigCoverUrl(coverId: number | undefined): string {
  if (!coverId) return '';
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
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
  let results: any[] = [];
  let errorMsg = '';

  if (type === 'isbn') {
    const url = `https://openlibrary.org/search.json?isbn=${query}&limit=${limit}`;
    try {
      const data = await proxyFetch(url) as { docs?: OpenLibraryDoc[] };
      results = (data.docs ?? []).slice(0, limit).map((doc) => ({
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
    } catch (e) {
      console.error('ISBN search failed:', e);
      errorMsg = '搜索失败，请检查 ISBN 或网络连接';
    }
  } else {
    if (containsChinese(query)) {
      const url = `https://weread.qq.com/web/search/global?keyword=${encodeURIComponent(query)}`;
      try {
        const data = await proxyFetch(url) as { books?: any[] };
        if (data.books && data.books.length > 0) {
          results = data.books.slice(0, limit).map((item: any) => {
            const book = item.bookInfo;
            return {
              key: `weread:${book.bookId}`,
              openlibraryKey: '',
              title: book.title || '',
              author: book.author || '',
              coverId: 0,
              coverUrl: book.cover || '',
              bigCoverUrl: book.cover || '',
              firstPublishYear: null,
              isbn: '',
              subjects: [],
              publisher: book.publisher || '',
              language: 'zh',
              source: 'weread',
              intro: book.intro || '',
              rating: book.newRating,
              price: book.price,
            };
          });
        } else {
          errorMsg = '未找到相关书籍';
        }
      } catch (e) {
        console.error('WeRead search failed:', e);
        errorMsg = '搜索失败，请检查网络连接';
      }
    } else {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;
      try {
        const data = await proxyFetch(url) as { docs?: OpenLibraryDoc[]; error?: string; detail?: any[] };
        if (data.error || (data.detail && data.detail.length > 0)) {
          const detailMsg = data.detail?.[0]?.msg || data.error || '';
          errorMsg = detailMsg ? `提示：${detailMsg}。建议使用英文书名或作者名搜索（例如 "To Live Yu Hua"）` : `OpenLibrary 不支持该搜索方式，建议使用英文书名或作者名搜索`;
        } else {
          results = (data.docs ?? []).slice(0, limit).map((doc) => ({
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
        }
      } catch (e) {
        console.error('OpenLibrary search failed:', e);
        errorMsg = '搜索失败，请检查网络连接';
      }
    }
  }

  initDb();
  const library = db.select().from(books).all();

  return NextResponse.json({ results, library, error: errorMsg });
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