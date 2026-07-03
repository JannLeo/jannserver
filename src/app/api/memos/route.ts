import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { memos, memoTags } from '@/lib/db/schema';
import { writeMarkdown, readMarkdown, generateSlug } from '@/lib/storage';
import { updateFts } from '@/lib/search';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/memos
export async function GET(req: NextRequest) {
  initDb();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('search');
  const all = db.select().from(memos).orderBy(desc(memos.updatedAt)).all();
  return NextResponse.json(all);
}

// POST /api/memos
export async function POST(req: NextRequest) {
  initDb();
  const { content, projectId, tagIds } = await req.json();
  const slug = uuidv4().slice(0, 8);
  const filePath = `memos/${new Date().toISOString().slice(0, 10)}_${slug}.md`;
  const now = new Date().toISOString();
  const { getExcerpt } = await import('@/lib/storage');
  const excerpt = getExcerpt(content || '');

  const id = uuidv4();
  writeMarkdown(filePath, content || '');
  db.insert(memos).values({ id, slug, content: content || '', filePath, projectId: projectId || null, excerpt, createdAt: now, updatedAt: now }).run();

  if (tagIds?.length) {
    for (const tagId of tagIds) db.insert(memoTags).values({ memoId: id, tagId }).run();
  }

  await updateFts('memo', id, slug, content || '');
  return NextResponse.json({ id, slug });
}

// DELETE /api/memos
export async function DELETE(req: NextRequest) {
  initDb();
  const { id } = await req.json();
  const memo = db.select().from(memos).where(eq(memos.id, id)).get();
  if (!memo) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { deleteFile } = await import('@/lib/storage');
  deleteFile(memo.filePath || '');
  const { deleteFts } = await import('@/lib/search');
  deleteFts(memo.id);
  db.delete(memos).where(eq(memos.id, id)).run();
  return NextResponse.json({ ok: true });
}