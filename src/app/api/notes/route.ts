import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { notes, noteTags, tags, searchFts } from '@/lib/db/schema';
import { writeMarkdown, readMarkdown, generateSlug, getExcerpt } from '@/lib/storage';
import { updateFts } from '@/lib/search';
import { eq, desc, like, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

function validateOriginCheck(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const allowed = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1').split(',');
  try {
    const url = new URL(origin);
    return allowed.some(h => h === url.hostname);
  } catch { return false; }
}

// GET /api/notes
export async function GET(req: NextRequest) {
  initDb();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('search');
  const tagId = searchParams.get('tag');
  const projectId = searchParams.get('project');
  const folderId = searchParams.get('folder');

  let query = db.select({
    id: notes.id,
    title: notes.title,
    slug: notes.slug,
    excerpt: notes.excerpt,
    folderId: notes.folderId,
    projectId: notes.projectId,
    createdAt: notes.createdAt,
    updatedAt: notes.updatedAt,
  }).from(notes);

  // Build WHERE conditions with drizzle and()
  const conds: ReturnType<typeof eq>[] = [];
  if (q) conds.push(like(notes.title, `%${q}%`));
  if (projectId) conds.push(eq(notes.projectId, projectId));
  if (folderId) conds.push(eq(notes.folderId, Number(folderId)));

  let results: any[];
  if (conds.length > 0) {
    results = db.select({
      id: notes.id, title: notes.title, slug: notes.slug,
      excerpt: notes.excerpt, folderId: notes.folderId,
      projectId: notes.projectId, createdAt: notes.createdAt, updatedAt: notes.updatedAt,
    }).from(notes).where(and(...conds)).all();
  } else {
    results = query.all();
  }

  results.sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime());

  return NextResponse.json(results);
}

// POST /api/notes
export async function POST(req: NextRequest) {
  initDb();
  const { title, content, folderId, projectId, tagIds } = await req.json();
  if (!title) return NextResponse.json({ error: '标题必填' }, { status: 400 });

  const slug = generateSlug(title) + '-' + uuidv4().slice(0, 8);
  const filePath = `notes/${slug}.md`;
  const now = new Date().toISOString();
  const excerpt = getExcerpt(content || '');

  const id = uuidv4();
  writeMarkdown(filePath, content || '');
  db.insert(notes).values({
    id, title, slug, filePath, folderId: folderId ? Number(folderId) : null,
    projectId: projectId || null, excerpt,
    isTodoExtracted: false,
    createdAt: now, updatedAt: now,
  }).run();

  // tags
  if (tagIds?.length) {
    for (const tagId of tagIds) {
      db.insert(noteTags).values({ noteId: id, tagId }).run();
    }
  }

  // FTS
  await updateFts('note', id, title, content || '');

  return NextResponse.json({ id, slug });
}

// DELETE /api/notes
export async function DELETE(req: NextRequest) {
  initDb();
  const { slug } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug 必填' }, { status: 400 });

  const note = db.select().from(notes).where(eq(notes.slug, slug)).get();
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { deleteFile } = await import('@/lib/storage');
  const { deleteFts } = await import('@/lib/search');
  deleteFile(note.filePath || '');
  deleteFts(note.id);
  db.delete(notes).where(eq(notes.slug, slug)).run();

  return NextResponse.json({ ok: true });
}