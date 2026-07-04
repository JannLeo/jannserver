// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { novelVolumes } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const volumes = db.select().from(novelVolumes)
      .where(eq(novelVolumes.novelId, params.id))
      .orderBy(novelVolumes.volumeNumber).all();
    return NextResponse.json(volumes);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const id = randomUUID();
    const existing = db.select().from(novelVolumes)
      .where(eq(novelVolumes.novelId, params.id)).all();
    const volNum = existing.length > 0 ? Math.max(...existing.map(v => v.volumeNumber)) + 1 : 1;

    db.insert(novelVolumes).values({
      id, novelId: params.id,
      volumeNumber: volNum,
      title: (body.title || `第 ${volNum} 卷`).trim(),
      synopsis: (body.synopsis || '').trim(),
      outline: (body.outline || '').trim(),
      wordCountTarget: Number(body.wordCountTarget) || 50000,
      status: 'planning', order: volNum,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    const vol = db.select().from(novelVolumes).where(eq(novelVolumes.id, id)).get();
    return NextResponse.json(vol, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const allowed = ['title', 'synopsis', 'outline', 'wordCountTarget', 'status'];
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const k of allowed) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    db.update(novelVolumes).set(updates).where(eq(novelVolumes.id, body.volumeId)).run();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}