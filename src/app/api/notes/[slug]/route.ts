import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { notes, noteTags } from '@/lib/db/schema';
import { writeMarkdown, readMarkdown, getExcerpt } from '@/lib/storage';
import { updateFts } from '@/lib/search';
import { eq } from 'drizzle-orm';

const MAX_TITLE_LENGTH = 300;
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
const MAX_TAGS = 50;
const MAX_ID_LENGTH = 128;

function normalizedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function parseTagIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_TAGS) return null;
  const ids = value.map((tag) => normalizedString(tag, MAX_ID_LENGTH));
  if (ids.some((tag) => !tag)) return null;
  return [...new Set(ids as string[])];
}

function parseFolderId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

// GET /api/notes/:slug
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  initDb();
  const note = db.select().from(notes).where(eq(notes.slug, params.slug)).get();
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const content = readMarkdown(note.filePath || '');
  const noteTagsList = db.select().from(noteTags).where(eq(noteTags.noteId, note.id)).all();

  return NextResponse.json({ ...note, content, tags: noteTagsList.map((tag) => tag.tagId) });
}

// PUT /api/notes/:slug
export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  initDb();
  const note = db.select().from(notes).where(eq(notes.slug, params.slug)).get();
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = normalizedString(body.title, MAX_TITLE_LENGTH);
    if (!title) {
      return NextResponse.json({ error: `标题不能为空且不能超过 ${MAX_TITLE_LENGTH} 字符` }, { status: 400 });
    }
    updates.title = title;
  }

  const folderId = parseFolderId(body.folderId);
  if (body.folderId !== undefined) {
    if (folderId === undefined) return NextResponse.json({ error: '无效的 folderId' }, { status: 400 });
    updates.folderId = folderId;
  }

  if (body.projectId !== undefined) {
    if (body.projectId === null || body.projectId === '') {
      updates.projectId = null;
    } else {
      const projectId = normalizedString(body.projectId, MAX_ID_LENGTH);
      if (!projectId) return NextResponse.json({ error: '无效的 projectId' }, { status: 400 });
      updates.projectId = projectId;
    }
  }

  let nextContent: string | undefined;
  if (body.content !== undefined) {
    if (typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content 必须是字符串' }, { status: 400 });
    }
    if (body.content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: '笔记内容过大' }, { status: 413 });
    }
    nextContent = body.content;
    updates.excerpt = getExcerpt(nextContent);
  }

  let tagIds: string[] | undefined;
  if (body.tagIds !== undefined) {
    const parsed = parseTagIds(body.tagIds);
    if (parsed === null) {
      return NextResponse.json({ error: `tagIds 必须是最多 ${MAX_TAGS} 个有效 ID` }, { status: 400 });
    }
    tagIds = parsed;
  }

  if (Object.keys(updates).length === 0 && tagIds === undefined && nextContent === undefined) {
    return NextResponse.json({ error: '没有可更新字段' }, { status: 400 });
  }

  const filePath = note.filePath || '';
  const previousContent = nextContent !== undefined ? readMarkdown(filePath) : '';
  const now = new Date().toISOString();

  try {
    if (nextContent !== undefined) writeMarkdown(filePath, nextContent);

    db.transaction((tx) => {
      if (Object.keys(updates).length > 0) {
        tx.update(notes)
          .set({ ...updates, updatedAt: now })
          .where(eq(notes.slug, params.slug))
          .run();
      } else if (tagIds !== undefined) {
        tx.update(notes).set({ updatedAt: now }).where(eq(notes.slug, params.slug)).run();
      }

      if (tagIds !== undefined) {
        tx.delete(noteTags).where(eq(noteTags.noteId, note.id)).run();
        for (const tagId of tagIds) {
          tx.insert(noteTags).values({ noteId: note.id, tagId }).run();
        }
      }
    });
  } catch (error) {
    if (nextContent !== undefined) {
      try { writeMarkdown(filePath, previousContent); } catch (restoreError) {
        console.error('[api/notes/:slug] failed to restore file after DB error', restoreError);
      }
    }
    console.error('[api/notes/:slug] update failed', error);
    return NextResponse.json({ error: '更新笔记失败' }, { status: 500 });
  }

  const updated = db.select().from(notes).where(eq(notes.slug, params.slug)).get();
  const contentText = nextContent !== undefined ? nextContent : readMarkdown(filePath);

  try {
    await updateFts('note', note.id, updated?.title || '', contentText);
  } catch (error) {
    console.error('[api/notes/:slug] FTS update failed', error);
  }

  const updatedTags = db.select().from(noteTags).where(eq(noteTags.noteId, note.id)).all();
  return NextResponse.json({
    ...updated,
    content: contentText,
    tags: updatedTags.map((tag) => tag.tagId),
  });
}
