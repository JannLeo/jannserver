import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { tasks } from '@/lib/db/schema';
import { and, desc, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const TASK_STATUSES = new Set(['todo', 'done']);
const TASK_PRIORITIES = new Set(['low', 'medium', 'high']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_RE.test(value)) return undefined;
  return value;
}

// GET /api/tasks
export async function GET(req: NextRequest) {
  initDb();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const projectId = searchParams.get('project');
  const date = searchParams.get('date');
  const today = new Date().toISOString().slice(0, 10);

  if (status && !TASK_STATUSES.has(status)) {
    return NextResponse.json({ error: '无效的任务状态' }, { status: 400 });
  }
  if (projectId && projectId.length > 128) {
    return NextResponse.json({ error: 'project 参数过长' }, { status: 400 });
  }
  if (date && date !== 'today') {
    return NextResponse.json({ error: '无效的 date 参数' }, { status: 400 });
  }

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(tasks.status, status));
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (date === 'today') {
    const todayCondition = or(
      eq(tasks.scheduledDate, today),
      and(isNull(tasks.scheduledDate), ne(tasks.status, 'done')),
    );
    if (todayCondition) conditions.push(todayCondition);
  }

  const priorityOrder = sql<number>`CASE ${tasks.priority}
    WHEN 'high' THEN 0
    WHEN 'medium' THEN 1
    ELSE 2
  END`;
  const whereClause = conditions.length ? and(...conditions) : undefined;
  const baseQuery = db.select().from(tasks);
  const results = whereClause
    ? baseQuery.where(whereClause).orderBy(priorityOrder, desc(tasks.updatedAt)).all()
    : baseQuery.orderBy(priorityOrder, desc(tasks.updatedAt)).all();

  return NextResponse.json(results);
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  initDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const priority = typeof body.priority === 'string' ? body.priority : 'medium';
  const dueDate = optionalDate(body.dueDate);
  const scheduledDate = optionalDate(body.scheduledDate);

  if (!title) return NextResponse.json({ error: '标题必填' }, { status: 400 });
  if (title.length > 500) return NextResponse.json({ error: '标题过长' }, { status: 400 });
  if (description.length > 10_000) return NextResponse.json({ error: '描述过长' }, { status: 400 });
  if (projectId.length > 128) return NextResponse.json({ error: 'projectId 过长' }, { status: 400 });
  if (!TASK_PRIORITIES.has(priority)) {
    return NextResponse.json({ error: '无效的优先级' }, { status: 400 });
  }
  if (dueDate === undefined || scheduledDate === undefined) {
    return NextResponse.json({ error: '日期必须使用 YYYY-MM-DD 格式' }, { status: 400 });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  db.insert(tasks).values({
    id,
    title,
    description: description || null,
    status: 'todo',
    priority,
    source: 'manual',
    projectId: projectId || null,
    dueDate,
    scheduledDate,
    createdAt: now,
    updatedAt: now,
  }).run();

  return NextResponse.json({ id }, { status: 201 });
}
