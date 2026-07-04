// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Queue directory for task delegations
const DELEGATION_DIR = path.join(process.env.HERMES_DATA_DIR || '/home/test/.hermes/data/delegations');

async function ensureDir() {
  try {
    await fs.mkdir(DELEGATION_DIR, { recursive: true });
  } catch {}
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: '无效请求体' }, { status: 400 });
  }

  const { taskId, taskTitle, projectName } = body || {};
  if (!taskId || !taskTitle) {
    return NextResponse.json({ ok: false, error: '缺少 taskId 或 taskTitle' }, { status: 400 });
  }

  // Store delegation request as a JSON file
  await ensureDir();
  const filePath = path.join(DELEGATION_DIR, `${taskId}.json`);
  const record = {
    taskId,
    taskTitle,
    projectName: projectName || null,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  try {
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
    return NextResponse.json({ ok: true, msg: `任务已加入委托队列：${taskTitle}` });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `写入失败: ${err.message}` }, { status: 500 });
  }
}

export async function GET() {
  await ensureDir();
  let files: string[] = [];
  try {
    files = await fs.readdir(DELEGATION_DIR);
  } catch {}

  const delegations = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const content = await fs.readFile(path.join(DELEGATION_DIR, f), 'utf-8');
      delegations.push(JSON.parse(content));
    } catch {}
  }

  delegations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return NextResponse.json({ delegations });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) {
    return NextResponse.json({ ok: false, error: '缺少 taskId' }, { status: 400 });
  }

  const filePath = path.join(DELEGATION_DIR, `${taskId}.json`);
  try {
    await fs.unlink(filePath);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Already gone is fine
  }
}