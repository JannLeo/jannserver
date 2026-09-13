import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { memos, memoTags } from '@/lib/db/schema';
import { writeMarkdown, generateSlug, getExcerpt, deleteFile } from '@/lib/storage';
import { updateFts, deleteFts } from '@/lib/search';
import { eq, desc, like } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const MAX_CONTENT_LENGTH = 512 * 1024;
const MAX_SEARCH_LENGTH = 256;
const MAX_TAGS = 50;
const MAX_ID_LENGTH = 128;
const MAX_LIST_RESULTS = 500;

function normalizedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function parseTagIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) return null;
  const ids = value.map((tag) => normalizedString(tag, MAX_ID_LENGTH));
  if (ids.some((tag) => !tag)) return null;
  return [...new Set(ids as string[])];
}

// GET /api/memos
export async function GET(req: NextRequest) {
  initDb();
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('search') || '').trim();
  if (q.length > MAX_SEARCH_LENGTH) {
    return NextResponse.json({ error: '搜索参数过长' }, { status: 400 });
  }

  const rows = q
    ? db.select().from(memos).where(like(memos.content, `%${q}%`)).orderBy(desc(memos.updatedAt)).limit(MAX_LIST_RESULTS).all()
    : db.select().from(memos).orderBy(desc(memos.updatedAt)).limit(MAX_LIST_RESULTS).all();
  return NextResponse.json(rows);
}

// POST /api/memos
export async function POST(req: NextRequest) {
  initDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const content = typeof body.content === 'string' ? body.content : '';
  if (!content.trim()) return NextResponse.json({ error: '内容必填' }, { status: 400 });
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: '备忘录内容过大' }, { status: 413 });
  }

  const projectId = body.projectId === undefined || body.projectId === null || body.projectId === ''
    ? null
    : normalizedString(body.projectId, MAX_ID_LENGTH);
  if (body.projectId && !projectId) {
    return NextResponse.json({ error: '无效的 projectId' }, { status: 400 });
  }

  const tagIds = parseTagIds(body.tagIds);
  if (tagIds === null) {
    return NextResponse.json({ error: `tagIds 必须是最多 ${MAX_TAGS} 个有效 ID` }, { status: 400 });
  }

  const slug = generateSlug(content.slice(0, 80)) || uuidv4().slice(0, 8);
  const uniqueSlug = `${slug}-${uuidv4().slice(0, 8)}`;
  const filePath = `memos/${new Date().toISOString().slice(0, 10)}_${uniqueSlug}.md`;
  const now = new Date().toISOString();
  const excerpt = getExcerpt(content);
  const id = uuidv4();

  try {
    writeMarkdown(filePath, content);
    db.transaction((tx) => {
      tx.insert(memos).values({
        id,
        slug: uniqueSlug,
        content,
        filePath,
        projectId,
        excerpt,
        createdAt: now,
        updatedAt: now,
      }).run();
      for (const tagId of tagIds) tx.insert(memoTags).values({ memoId: id, tagId }).run();
    });
  } catch (error) {
    try { deleteFile(filePath); } catch {}
    console.error('[api/memos] failed to create memo', error);
    return NextResponse.json({ error: '创建备忘录失败' }, { status: 500 });
  }

  try {
    await updateFts('memo', id, uniqueSlug, content);
  } catch (error) {
    console.error('[api/memos] FTS update failed after create', error);
  }

  return NextResponse.json({ id, slug: uniqueSlug }, { status: 201 });
}

// DELETE /api/memos
export async function DELETE(req: NextRequest) {
  initDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const id = normalizedString(body.id, MAX_ID_LENGTH);
  if (!id) return NextResponse.json({ error: 'id 必填' }, { status: 400 });

  const memo = db.select().from(memos).where(eq(memos.id, id)).get();
  if (!memo) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    db.transaction((tx) => {
      tx.delete(memoTags).where(eq(memoTags.memoId, memo.id)).run();
      tx.delete(memos).where(eq(memos.id, id)).run();
    });
    deleteFile(memo.filePath || '');
    deleteFts(memo.id);
  } catch (error) {
    console.error('[api/memos] failed to delete memo', error);
    return NextResponse.json({ error: '删除备忘录失败' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
