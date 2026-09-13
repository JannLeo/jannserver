import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/tasks/:id
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  initDb();
  const task = db.select().from(tasks).where(eq(tasks.id, params.id)).get();
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(task);
}

// PATCH /api/tasks/:id
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  initDb();
  const { status } = await req.json();
  const now = new Date().toISOString();
  const updates: any = { status, updatedAt: now };
  if (status === 'done') updates.completedAt = now;
  db.update(tasks).set(updates).where(eq(tasks.id, params.id)).run();
  return NextResponse.json({ ok: true });
}

// DELETE /api/tasks/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  initDb();
  db.delete(tasks).where(eq(tasks.id, params.id)).run();
  return NextResponse.json({ ok: true });
}