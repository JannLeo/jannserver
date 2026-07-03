import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { dailyPages } from '@/lib/db/schema';
import { writeMarkdown, readMarkdown } from '@/lib/storage';
import { updateFts } from '@/lib/search';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

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

// GET /api/daily/:date
export async function GET(req: NextRequest, { params }: { params: { date: string } }) {
  initDb();
  const { date } = params;
  let page = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();

  if (!page) {
    // 自动创建
    const id = uuidv4();
    const filePath = `daily/${date}.md`;
    const template = DEFAULT_DAILY_TEMPLATE.replace('{{date}}', date);
    writeMarkdown(filePath, template);

    const now = new Date().toISOString();
    db.insert(dailyPages).values({ id, date, filePath, createdAt: now, updatedAt: now }).run();
    page = { id, date, filePath, createdAt: now, updatedAt: now } as any;
    await updateFts('daily', id, `Daily ${date}`, template);
  }

  const content = readMarkdown(page!.filePath || '');
  return NextResponse.json({ ...page!, content });
}

// PUT /api/daily/:date
export async function PUT(req: NextRequest, { params }: { params: { date: string } }) {
  initDb();
  const { date } = params;
  const { content } = await req.json();
  const page = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();
  if (!page) return NextResponse.json({ error: 'not found' }, { status: 404 });

  writeMarkdown(page.filePath || '', content);
  db.update(dailyPages).set({ updatedAt: new Date().toISOString() }).where(eq(dailyPages.date, date)).run();
  await updateFts('daily', page.id, `Daily ${date}`, content);

  return NextResponse.json({ ok: true });
}