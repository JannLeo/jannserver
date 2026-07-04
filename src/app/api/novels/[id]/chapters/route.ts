// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { novelChapters } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const chapters = db.select().from(novelChapters)
      .where(eq(novelChapters.novelId, params.id))
      .orderBy(novelChapters.volumeNumber, novelChapters.chapterNumber)
      .all();
    return NextResponse.json(chapters);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const id = randomUUID();
    const now = new Date().toISOString();

    // Get current max chapter number
    const existing = db.select().from(novelChapters)
      .where(eq(novelChapters.novelId, params.id))
      .orderBy(desc(novelChapters.chapterNumber)).all();
    const maxChapNum = existing.length > 0 ? existing[0].chapterNumber : 0;

    db.insert(novelChapters).values({
      id,
      novelId: params.id,
      volumeNumber: Number(body.volumeNumber) || 1,
      chapterNumber: Number(body.chapterNumber) || (maxChapNum + 1),
      title: (body.title || `第 ${maxChapNum + 1} 章`).trim(),
      outline: (body.outline || '').trim(),
      content: (body.content || '').trim(),
      wordCount: 0,
      status: 'outline',
      order: maxChapNum + 1,
      createdAt: now,
      updatedAt: now,
    }).run();

    const chapter = db.select().from(novelChapters).where(eq(novelChapters.id, id)).get();
    return NextResponse.json(chapter, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { chapterId } = body;
    if (!chapterId) return NextResponse.json({ error: '缺少 chapterId' }, { status: 400 });

    const allowed = ['title', 'outline', 'content', 'status', 'wordCount', 'volumeNumber', 'chapterNumber'];
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const k of allowed) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    db.update(novelChapters).set(updates).where(eq(novelChapters.id, chapterId)).run();
    const chapter = db.select().from(novelChapters).where(eq(novelChapters.id, chapterId)).get();
    return NextResponse.json(chapter);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get('chapterId');
    if (!chapterId) return NextResponse.json({ error: '缺少 chapterId' }, { status: 400 });
    db.delete(novelChapters).where(eq(novelChapters.id, chapterId)).run();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}