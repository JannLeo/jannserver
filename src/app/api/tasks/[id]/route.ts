import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const TASK_STATUSES = new Set(['todo', 'done']);

// GET /api/tasks/:id
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  initDb();
  const task = db.select().from(tasks).where(eq(tasks.id, params.id)).get();
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(task);
}

// PATCH /api/tasks/:id
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  initDb();

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const status = typeof body.status === 'string' ? body.status : '';
  if (!TASK_STATUSES.has(status)) {
    return NextResponse.json({ error: '无效的任务状态' }, { status: 400 });
  }

  const existing = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, params.id)).get();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const now = new Date().toISOString();
  db.update(tasks)
    .set({
      status,
      updatedAt: now,
      completedAt: status === 'done' ? now : null,
    })
    .where(eq(tasks.id, params.id))
    .run();

  return NextResponse.json({ ok: true });
}

// DELETE /api/tasks/:id
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  initDb();
  const existing = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, params.id)).get();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  db.delete(tasks).where(eq(tasks.id, params.id)).run();
  return NextResponse.json({ ok: true });
}
