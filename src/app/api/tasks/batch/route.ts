// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { tasks } from '@/lib/db/schema';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/tasks/batch — 批量创建任务
export async function POST(req: NextRequest) {
  initDb();
  const body = await req.json();
  const items: any[] = Array.isArray(body) ? body : body.items || [];

  if (!items.length) return NextResponse.json({ error: '无任务数据' }, { status: 400 });

  const now = new Date().toISOString();
  const ids: string[] = [];

  for (const item of items) {
    if (!item.title) continue;
    const id = uuidv4();
    db.insert(tasks).values({
      id,
      title: String(item.title).slice(0, 200),
      description: item.description ? String(item.description).slice(0, 1000) : null,
      status: 'todo',
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
      source: 'ai',
      projectId: item.projectId || null,
      dueDate: item.dueDate || null,
      scheduledDate: item.scheduledDate || null,
      createdAt: now,
      updatedAt: now,
    }).run();
    ids.push(id);
  }

  return NextResponse.json({ ok: true, ids, count: ids.length });
}