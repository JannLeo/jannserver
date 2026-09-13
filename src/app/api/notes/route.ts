import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { notes, noteTags } from '@/lib/db/schema';
import { writeMarkdown, generateSlug, getExcerpt, deleteFile } from '@/lib/storage';
import { updateFts, deleteFts } from '@/lib/search';
import { eq, desc, like, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const MAX_TITLE_LENGTH = 300;
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
const MAX_FILTER_LENGTH = 256;
const MAX_TAGS = 50;
const MAX_ID_LENGTH = 128;
const MAX_LIST_RESULTS = 500;

function normalizedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function parseFolderId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseTagIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) return null;
  const ids = value.map((tag) => normalizedString(tag, MAX_ID_LENGTH));
  if (ids.some((tag) => !tag)) return null;
  return [...new Set(ids as string[])];
}

// GET /api/notes
export async function GET(req: NextRequest) {
  initDb();
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('search') || '').trim();
  const tagId = (searchParams.get('tag') || '').trim();
  const projectId = (searchParams.get('project') || '').trim();
  const folderRaw = searchParams.get('folder');

  if ([q, tagId, projectId].some((value) => value.length > MAX_FILTER_LENGTH)) {
    return NextResponse.json({ error: '筛选参数过长' }, { status: 400 });
  }

  let folderId: number | null = null;
  if (folderRaw !== null) {
    const parsedFolderId = Number(folderRaw);
    if (!Number.isSafeInteger(parsedFolderId) || parsedFolderId <= 0) {
      return NextResponse.json({ error: '无效的 folder 参数' }, { status: 400 });
    }
    folderId = parsedFolderId;
  }

  const conds: any[] = [];
  if (q) conds.push(like(notes.title, `%${q}%`));
  if (projectId) conds.push(eq(notes.projectId, projectId));
  if (folderId !== null) conds.push(eq(notes.folderId, folderId));

  if (tagId) {
    const tagged = db
      .select({ noteId: noteTags.noteId })
      .from(noteTags)
      .where(eq(noteTags.tagId, tagId))
      .limit(MAX_LIST_RESULTS + 1)
      .all();
    const noteIds = [...new Set(tagged.map((row) => row.noteId))];
    if (noteIds.length === 0) return NextResponse.json([]);
    conds.push(inArray(notes.id, noteIds.slice(0, MAX_LIST_RESULTS)));
  }

  const selection = {
    id: notes.id,
    title: notes.title,
    slug: notes.slug,
    excerpt: notes.excerpt,
    folderId: notes.folderId,
    projectId: notes.projectId,
    createdAt: notes.createdAt,
    updatedAt: notes.updatedAt,
  };

  const results = conds.length > 0
    ? db.select(selection).from(notes).where(and(...conds)).orderBy(desc(notes.updatedAt)).limit(MAX_LIST_RESULTS).all()
    : db.select(selection).from(notes).orderBy(desc(notes.updatedAt)).limit(MAX_LIST_RESULTS).all();

  return NextResponse.json(results);
}

// POST /api/notes
export async function POST(req: NextRequest) {
  initDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const title = normalizedString(body.title, MAX_TITLE_LENGTH);
  if (!title) return NextResponse.json({ error: `标题必填且不能超过 ${MAX_TITLE_LENGTH} 字符` }, { status: 400 });

  const content = typeof body.content === 'string' ? body.content : '';
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: '笔记内容过大' }, { status: 413 });
  }

  const folderId = parseFolderId(body.folderId);
  if (body.folderId !== undefined && folderId === undefined) {
    return NextResponse.json({ error: '无效的 folderId' }, { status: 400 });
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

  const slugBase = generateSlug(title) || 'note';
  const slug = `${slugBase}-${uuidv4().slice(0, 8)}`;
  const filePath = `notes/${slug}.md`;
  const now = new Date().toISOString();
  const excerpt = getExcerpt(content);
  const id = uuidv4();

  try {
    writeMarkdown(filePath, content);

    db.transaction((tx) => {
      tx.insert(notes).values({
        id,
        title,
        slug,
        filePath,
        folderId: folderId ?? null,
        projectId,
        excerpt,
        isTodoExtracted: false,
        createdAt: now,
        updatedAt: now,
      }).run();

      for (const tagId of tagIds) {
        tx.insert(noteTags).values({ noteId: id, tagId }).run();
      }
    });
  } catch (error) {
    try { deleteFile(filePath); } catch {}
    console.error('[api/notes] failed to create note', error);
    return NextResponse.json({ error: '创建笔记失败' }, { status: 500 });
  }

  try {
    await updateFts('note', id, title, content);
  } catch (error) {
    console.error('[api/notes] FTS update failed after create', error);
  }

  return NextResponse.json({ id, slug }, { status: 201 });
}

// DELETE /api/notes
export async function DELETE(req: NextRequest) {
  initDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const slug = normalizedString(body.slug, 160);
  if (!slug) return NextResponse.json({ error: 'slug 必填' }, { status: 400 });

  const note = db.select().from(notes).where(eq(notes.slug, slug)).get();
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    db.transaction((tx) => {
      tx.delete(noteTags).where(eq(noteTags.noteId, note.id)).run();
      tx.delete(notes).where(eq(notes.slug, slug)).run();
    });
    deleteFile(note.filePath || '');
    deleteFts(note.id);
  } catch (error) {
    console.error('[api/notes] failed to delete note', error);
    return NextResponse.json({ error: '删除笔记失败' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
