import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { dailyPages } from '@/lib/db/schema';
import { writeMarkdown, readMarkdown, deleteFile } from '@/lib/storage';
import { updateFts } from '@/lib/search';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DEFAULT_DAILY_TEMPLATE = `# {{date}}

## 今日重点
- 

## 今日任务
- [ ] 

## 今日备忘
- 

## 今日完成
- 

## 今日问题
- 

## 明日跟进
- 
`;

function isValidDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function invalidDateResponse() {
  return NextResponse.json({ error: 'date 必须是有效的 YYYY-MM-DD' }, { status: 400 });
}

async function safeUpdateFts(id: string, date: string, content: string) {
  try {
    await updateFts('daily', id, `Daily ${date}`, content);
  } catch (error) {
    console.error('[api/daily] FTS update failed', error);
  }
}

// GET /api/daily/:date
export async function GET(req: NextRequest, { params }: { params: { date: string } }) {
  initDb();
  const { date } = params;
  if (!isValidDate(date)) return invalidDateResponse();

  let page = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();

  if (!page) {
    const id = uuidv4();
    const filePath = `daily/${date}.md`;
    const template = DEFAULT_DAILY_TEMPLATE.replace('{{date}}', date);
    const now = new Date().toISOString();

    // Reserve the unique date in SQLite first. If a concurrent request wins,
    // re-read its row instead of writing a competing file/record pair.
    db.insert(dailyPages)
      .values({ id, date, filePath, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
    page = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();

    if (page?.id === id) {
      try {
        writeMarkdown(filePath, template);
      } catch (error) {
        db.delete(dailyPages).where(eq(dailyPages.id, id)).run();
        console.error('[api/daily] failed to create daily file', error);
        return NextResponse.json({ error: '创建 Daily 失败' }, { status: 500 });
      }
      await safeUpdateFts(id, date, template);
    }
  }

  if (!page) return NextResponse.json({ error: '创建 Daily 失败' }, { status: 500 });
  const content = readMarkdown(page.filePath || '');
  return NextResponse.json({ ...page, content });
}

// POST /api/daily/:date - 创建或更新每日页面
export async function POST(req: NextRequest, { params }: { params: { date: string } }) {
  initDb();
  const { date } = params;
  if (!isValidDate(date)) return invalidDateResponse();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  if (body.content !== undefined && typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content 必须是字符串' }, { status: 400 });
  }
  const requestedContent = typeof body.content === 'string' ? body.content : undefined;
  if (requestedContent && requestedContent.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: 'Daily 内容过大' }, { status: 413 });
  }

  let page = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();

  if (!page) {
    const id = uuidv4();
    const filePath = `daily/${date}.md`;
    const content = requestedContent ?? DEFAULT_DAILY_TEMPLATE.replace('{{date}}', date);
    const now = new Date().toISOString();

    db.insert(dailyPages)
      .values({ id, date, filePath, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
    page = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();

    if (page?.id === id) {
      try {
        writeMarkdown(filePath, content);
      } catch (error) {
        db.delete(dailyPages).where(eq(dailyPages.id, id)).run();
        console.error('[api/daily] failed to create daily file', error);
        return NextResponse.json({ error: '创建 Daily 失败' }, { status: 500 });
      }
      await safeUpdateFts(id, date, content);
      return NextResponse.json({ id, date, filePath, content }, { status: 201 });
    }
  }

  if (!page) return NextResponse.json({ error: '创建 Daily 失败' }, { status: 500 });
  if (requestedContent === undefined) {
    const content = readMarkdown(page.filePath || '');
    return NextResponse.json({ ...page, content });
  }

  const previousContent = readMarkdown(page.filePath || '');
  try {
    writeMarkdown(page.filePath || '', requestedContent);
    db.update(dailyPages)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(dailyPages.date, date))
      .run();
  } catch (error) {
    try { writeMarkdown(page.filePath || '', previousContent); } catch {}
    console.error('[api/daily] failed to update daily page', error);
    return NextResponse.json({ error: '更新 Daily 失败' }, { status: 500 });
  }
  await safeUpdateFts(page.id, date, requestedContent);
  return NextResponse.json({ ok: true });
}

// PUT /api/daily/:date
export async function PUT(req: NextRequest, { params }: { params: { date: string } }) {
  initDb();
  const { date } = params;
  if (!isValidDate(date)) return invalidDateResponse();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content 必须是字符串' }, { status: 400 });
  }
  if (body.content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: 'Daily 内容过大' }, { status: 413 });
  }

  const page = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();
  if (!page) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const previousContent = readMarkdown(page.filePath || '');
  try {
    writeMarkdown(page.filePath || '', body.content);
    db.update(dailyPages)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(dailyPages.date, date))
      .run();
  } catch (error) {
    try { writeMarkdown(page.filePath || '', previousContent); } catch {}
    console.error('[api/daily] failed to update daily page', error);
    return NextResponse.json({ error: '更新 Daily 失败' }, { status: 500 });
  }

  await safeUpdateFts(page.id, date, body.content);
  return NextResponse.json({ ok: true });
}
