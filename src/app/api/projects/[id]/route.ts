import { NextRequest, NextResponse } from 'next/server';
import { db, initDb, sqlite } from '@/lib/db/index';
import { projects, notes, tasks, memos } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/projects/[id] — 项目详情 + 关联数据
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  initDb();
  const id = params.id;

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

  // 用 raw sqlite 避开 drizzle ORM quirks
  const raw = sqlite as any;

  const noteRows = raw
    .prepare(`SELECT id, title, excerpt, tags, updated_at FROM notes WHERE project_id = ? ORDER BY updated_at DESC LIMIT 20`)
    .all(id) as any[];

  const taskRows = raw
    .prepare(`SELECT id, title, status, priority, tags, due_date, completed_at, updated_at FROM tasks WHERE project_id = ? ORDER BY updated_at DESC LIMIT 20`)
    .all(id) as any[];

  const memoRows = raw
    .prepare(`SELECT id, slug, content, excerpt, tags, updated_at FROM memos WHERE project_id = ? ORDER BY updated_at DESC LIMIT 20`)
    .all(id) as any[];

  // 统计
  const stats = {
    notesCount: noteRows.length,
    tasksTotal: taskRows.length,
    tasksDone: taskRows.filter((t: any) => t.status === 'done' || t.status === 'completed').length,
    memosCount: memoRows.length,
  };

  return NextResponse.json({ project, notes: noteRows, tasks: taskRows, memos: memoRows, stats });
}

// PUT /api/projects/[id] — 更新项目
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  initDb();
  const id = params.id;
  const body = await req.json();
  const now = new Date().toISOString();

  const existing = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!existing) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

  const updates: Record<string, any> = { updatedAt: now };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.color !== undefined) updates.color = body.color;
  if (body.status !== undefined) updates.status = body.status;

  db.update(projects).set(updates).where(eq(projects.id, id)).run();
  const updated = db.select().from(projects).where(eq(projects.id, id)).get();
  return NextResponse.json(updated);
}

// DELETE /api/projects/[id] — 删除项目（不删除关联数据，只解除关联）
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  initDb();
  const id = params.id;

  // 解除关联：把该项目下的 notes/tasks/memos 的 project_id 置空
  const raw = sqlite as any;
  raw.prepare(`UPDATE notes SET project_id = NULL WHERE project_id = ?`).run(id);
  raw.prepare(`UPDATE tasks SET project_id = NULL WHERE project_id = ?`).run(id);
  raw.prepare(`UPDATE memos SET project_id = NULL WHERE project_id = ?`).run(id);

  db.delete(projects).where(eq(projects.id, id)).run();
  return NextResponse.json({ ok: true, message: '项目已删除，关联笔记/任务/备忘录已解除绑定' });
}