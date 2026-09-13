// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { tasks } from '@/lib/db/schema';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BATCH_SIZE = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_REFERENCE_LENGTH = 128;

function optionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

// POST /api/tasks/batch — 批量创建任务
export async function POST(req: NextRequest) {
  initDb();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const rawItems: unknown[] = Array.isArray(body)
    ? body
    : (body && Array.isArray(body.items) ? body.items : []);

  if (rawItems.length === 0) {
    return NextResponse.json({ error: '无任务数据' }, { status: 400 });
  }
  if (rawItems.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `单次最多创建 ${MAX_BATCH_SIZE} 条任务` },
      { status: 413 },
    );
  }

  const now = new Date().toISOString();
  const rows = rawItems.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const title = optionalString(item.title, MAX_TITLE_LENGTH);
    if (!title) return [];

    return [{
      id: uuidv4(),
      title,
      description: optionalString(item.description, MAX_DESCRIPTION_LENGTH),
      status: 'todo',
      priority: ['high', 'medium', 'low'].includes(String(item.priority))
        ? String(item.priority)
        : 'medium',
      source: 'ai',
      projectId: optionalString(item.projectId, MAX_REFERENCE_LENGTH),
      dueDate: optionalString(item.dueDate, 64),
      scheduledDate: optionalString(item.scheduledDate, 64),
      createdAt: now,
      updatedAt: now,
    }];
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: '没有有效任务' }, { status: 400 });
  }

  // Keep the batch atomic: either every validated task is created or none are.
  db.transaction((tx) => {
    for (const row of rows) tx.insert(tasks).values(row).run();
  });

  return NextResponse.json({
    ok: true,
    ids: rows.map((row) => row.id),
    count: rows.length,
    skipped: rawItems.length - rows.length,
  });
}
