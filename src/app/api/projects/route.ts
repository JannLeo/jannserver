import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { projects, notes, tasks, memos } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/projects
export async function GET() {
  initDb();
  const all = db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
  return NextResponse.json(all);
}

// POST /api/projects
export async function POST(req: NextRequest) {
  initDb();
  const { name, description, color } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.insert(projects).values({ id, name, description: description || '', color: color || '#3b82f6', createdAt: now, updatedAt: now }).run();
  return NextResponse.json({ id });
}

// DELETE /api/projects
export async function DELETE(req: NextRequest) {
  initDb();
  const { id } = await req.json();
  db.delete(projects).where(eq(projects.id, id)).run();
  return NextResponse.json({ ok: true });
}

// PUT /api/projects
export async function PUT(req: NextRequest) {
  initDb();
  const { id, name, description, color, status } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const now = new Date().toISOString();
  const updates: Record<string, any> = { updatedAt: now };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (color !== undefined) updates.color = color;
  if (status !== undefined) updates.status = status;
  db.update(projects).set(updates).where(eq(projects.id, id)).run();
  return NextResponse.json({ ok: true });
}