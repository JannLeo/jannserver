import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { notes, noteTags } from '@/lib/db/schema';
import { writeMarkdown, readMarkdown } from '@/lib/storage';
import { updateFts } from '@/lib/search';
import { eq } from 'drizzle-orm';

// GET /api/notes/:slug
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  initDb();
  const note = db.select().from(notes).where(eq(notes.slug, params.slug)).get();
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const content = readMarkdown(note.filePath || '');
  const noteTagsList = db.select().from(noteTags).where(eq(noteTags.noteId, note.id)).all();

  return NextResponse.json({ ...note, content, tags: noteTagsList.map(t => t.tagId) });
}

// PUT /api/notes/:slug
export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  initDb();
  const note = db.select().from(notes).where(eq(notes.slug, params.slug)).get();
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { title, content, folderId, projectId, tagIds } = await req.json();
  const now = new Date().toISOString();

  if (title) {
    db.update(notes).set({ title, updatedAt: now }).where(eq(notes.slug, params.slug)).run();
  }
  if (folderId !== undefined) {
    db.update(notes).set({ folderId: folderId || null, updatedAt: now }).where(eq(notes.slug, params.slug)).run();
  }
  if (projectId !== undefined) {
    db.update(notes).set({ projectId: projectId || null, updatedAt: now }).where(eq(notes.slug, params.slug)).run();
  }
  if (content !== undefined) {
    writeMarkdown(note.filePath || '', content);
    const { getExcerpt } = await import('@/lib/storage');
    const excerpt = getExcerpt(content);
    db.update(notes).set({ excerpt, updatedAt: now }).where(eq(notes.slug, params.slug)).run();
  }

  // tags update
  if (tagIds) {
    db.delete(noteTags).where(eq(noteTags.noteId, note.id)).run();
    for (const tagId of tagIds) {
      db.insert(noteTags).values({ noteId: note.id, tagId }).run();
    }
  }

  const updated = db.select().from(notes).where(eq(notes.slug, params.slug)).get();
  const contentText = readMarkdown(note.filePath || '');
  await updateFts('note', note.id, updated?.title || '', content || contentText);

  return NextResponse.json({ ...updated, content: content || contentText });
}