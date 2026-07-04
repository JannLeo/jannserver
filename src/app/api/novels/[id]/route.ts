// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { novels, novelChapters, novelVolumes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const novel = db.select().from(novels).where(eq(novels.id, params.id)).get();
    if (!novel) return NextResponse.json({ error: '小说不存在' }, { status: 404 });

    const chapters = db.select().from(novelChapters)
      .where(eq(novelChapters.novelId, params.id))
      .orderBy(novelChapters.volumeNumber, novelChapters.chapterNumber)
      .all();
    const volumes = db.select().from(novelVolumes)
      .where(eq(novelVolumes.novelId, params.id))
      .orderBy(novelVolumes.volumeNumber)
      .all();

    return NextResponse.json({ ...novel, chapters, volumes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const allowed = ['title', 'author', 'genre', 'synopsis', 'worldSetting', 'genreSetting',
      'characterSettings', 'currentPhase', 'currentChapter', 'totalWords', 'wordCountTarget', 'status'];
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const k of allowed) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    db.update(novels).set(updates).where(eq(novels.id, params.id)).run();
    const novel = db.select().from(novels).where(eq(novels.id, params.id)).get();
    return NextResponse.json(novel);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Delete related data
    db.delete(novelChapters).where(eq(novelChapters.novelId, params.id)).run();
    db.delete(novelVolumes).where(eq(novelVolumes.novelId, params.id)).run();
    db.delete(novels).where(eq(novels.id, params.id)).run();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}