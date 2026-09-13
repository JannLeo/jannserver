import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { projects, notes, tasks, memos } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const PROJECT_STATUSES = new Set(['active', 'archived']);
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function readString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : null;
}

function invalidJson() {
  return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
}

// GET /api/projects
export async function GET() {
  initDb();
  const all = db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
  return NextResponse.json(all);
}

// POST /api/projects
export async function POST(req: NextRequest) {
  initDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const name = readString(body.name, 200);
  const description = body.description === undefined ? '' : readString(body.description, 10_000);
  const color = body.color === undefined ? '#3b82f6' : readString(body.color, 7);

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (description === null) return NextResponse.json({ error: 'description 过长' }, { status: 400 });
  if (!color || !COLOR_RE.test(color)) {
    return NextResponse.json({ error: 'color 必须是 #RRGGBB' }, { status: 400 });
  }

  const duplicate = db.select({ id: projects.id }).from(projects).where(eq(projects.name, name)).get();
  if (duplicate) return NextResponse.json({ error: '项目名称已存在' }, { status: 409 });

  const id = uuidv4();
  const now = new Date().toISOString();
  db.insert(projects).values({
    id,
    name,
    description,
    color,
    createdAt: now,
    updatedAt: now,
  }).run();
  return NextResponse.json({ id }, { status: 201 });
}

// DELETE /api/projects
export async function DELETE(req: NextRequest) {
  initDb();

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  db.transaction((tx) => {
    tx.update(notes).set({ projectId: null }).where(eq(notes.projectId, id)).run();
    tx.update(tasks).set({ projectId: null }).where(eq(tasks.projectId, id)).run();
    tx.update(memos).set({ projectId: null }).where(eq(memos.projectId, id)).run();
    tx.delete(projects).where(eq(projects.id, id)).run();
  });

  return NextResponse.json({ ok: true });
}

// PUT /api/projects
export async function PUT(req: NextRequest) {
  initDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const updates: Partial<typeof projects.$inferInsert> = { updatedAt: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = readString(body.name, 200);
    if (!name) return NextResponse.json({ error: '无效的项目名称' }, { status: 400 });
    const duplicate = db.select({ id: projects.id }).from(projects).where(eq(projects.name, name)).get();
    if (duplicate && duplicate.id !== id) {
      return NextResponse.json({ error: '项目名称已存在' }, { status: 409 });
    }
    updates.name = name;
  }

  if (body.description !== undefined) {
    const description = readString(body.description, 10_000);
    if (description === null) return NextResponse.json({ error: 'description 过长' }, { status: 400 });
    updates.description = description;
  }

  if (body.color !== undefined) {
    const color = readString(body.color, 7);
    if (!color || !COLOR_RE.test(color)) {
      return NextResponse.json({ error: 'color 必须是 #RRGGBB' }, { status: 400 });
    }
    updates.color = color;
  }

  if (body.status !== undefined) {
    const status = typeof body.status === 'string' ? body.status : '';
    if (!PROJECT_STATUSES.has(status)) {
      return NextResponse.json({ error: '无效的项目状态' }, { status: 400 });
    }
    updates.status = status;
  }

  db.update(projects).set(updates).where(eq(projects.id, id)).run();
  return NextResponse.json({ ok: true });
}
