import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DELEGATION_DIR = path.resolve(
  process.env.HERMES_DATA_DIR || '/home/test/.hermes/data/delegations',
);
const SAFE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  try {
    const session = await getSession();
    if (session.userId) return null;
  } catch (error) {
    console.error('[delegations] failed to read session', error);
  }

  const expected = process.env.DELEGATION_API_KEY?.trim() || '';
  const provided = req.headers.get('x-delegation-key')?.trim() || '';
  if (expected && provided && secureEqual(provided, expected)) return null;

  return NextResponse.json(
    { ok: false, error: 'Unauthorized' },
    { status: 401 },
  );
}

function delegationPath(taskId: string): string | null {
  if (!SAFE_TASK_ID.test(taskId)) return null;
  const candidate = path.resolve(DELEGATION_DIR, `${taskId}.json`);
  if (path.dirname(candidate) !== DELEGATION_DIR) return null;
  return candidate;
}

async function ensureDir() {
  await fs.mkdir(DELEGATION_DIR, { recursive: true });
}

export async function POST(req: NextRequest) {
  const authError = await authorize(req);
  if (authError) return authError;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: '无效请求体' }, { status: 400 });
  }

  const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : '';
  const taskTitle = typeof body?.taskTitle === 'string' ? body.taskTitle.trim() : '';
  const projectName = typeof body?.projectName === 'string' ? body.projectName.trim() : '';
  const filePath = delegationPath(taskId);

  if (!filePath || !taskTitle) {
    return NextResponse.json(
      { ok: false, error: 'taskId 格式无效或缺少 taskTitle' },
      { status: 400 },
    );
  }
  if (taskTitle.length > 512 || projectName.length > 256) {
    return NextResponse.json({ ok: false, error: '字段过长' }, { status: 400 });
  }

  await ensureDir();
  const record = {
    taskId,
    taskTitle,
    projectName: projectName || null,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  try {
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), {
      encoding: 'utf-8',
      flag: 'w',
      mode: 0o600,
    });
    return NextResponse.json({ ok: true, msg: `任务已加入委托队列：${taskTitle}` });
  } catch (err: any) {
    console.error('[delegations] write failed', err);
    return NextResponse.json({ ok: false, error: '写入失败' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authError = await authorize(req);
  if (authError) return authError;

  await ensureDir();
  let files: string[] = [];
  try {
    files = (await fs.readdir(DELEGATION_DIR))
      .filter((name) => name.endsWith('.json'))
      .slice(0, 1000);
  } catch (err) {
    console.error('[delegations] list failed', err);
    return NextResponse.json({ delegations: [], error: '读取委托队列失败' }, { status: 500 });
  }

  const delegations: any[] = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(DELEGATION_DIR, file), 'utf-8');
      delegations.push(JSON.parse(content));
    } catch {
      // Ignore a single malformed/in-flight file without breaking the whole queue.
    }
  }

  delegations.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return NextResponse.json({ delegations });
}

export async function DELETE(req: NextRequest) {
  const authError = await authorize(req);
  if (authError) return authError;

  const taskId = req.nextUrl.searchParams.get('taskId')?.trim() || '';
  const filePath = delegationPath(taskId);
  if (!filePath) {
    return NextResponse.json({ ok: false, error: 'taskId 格式无效' }, { status: 400 });
  }

  try {
    await fs.unlink(filePath);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'ENOENT') return NextResponse.json({ ok: true });
    console.error('[delegations] delete failed', err);
    return NextResponse.json({ ok: false, error: '删除失败' }, { status: 500 });
  }
}
