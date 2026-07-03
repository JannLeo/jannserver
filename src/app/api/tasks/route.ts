import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { tasks } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/tasks
export async function GET(req: NextRequest) {
  initDb();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const projectId = searchParams.get('project');

  let results = db.select().from(tasks).all();
  if (status) results = results.filter(r => r.status === status);
  if (projectId) results = results.filter(r => r.projectId === projectId);

  // sort by priority then updatedAt
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 1;
    const pb = priorityOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime();
  });

  return NextResponse.json(results);
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  initDb();
  const { title, description, projectId, priority, dueDate, scheduledDate } = await req.json();
  if (!title) return NextResponse.json({ error: '标题必填' }, { status: 400 });

  const id = uuidv4();
  const now = new Date().toISOString();
  db.insert(tasks).values({
    id, title,
    description: description || null,
    status: 'todo',
    priority: priority || 'medium',
    source: 'manual',
    projectId: projectId || null,
    dueDate: dueDate || null,
    scheduledDate: scheduledDate || null,
    createdAt: now, updatedAt: now,
  }).run();

  return NextResponse.json({ id });
}