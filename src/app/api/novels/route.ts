import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { novels } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const all = db.select().from(novels).orderBy(desc(novels.updatedAt)).all();
    return NextResponse.json(all);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(novels).values({
      id,
      title: (body.title || '未命名小说').trim(),
      author: (body.author || '').trim(),
      genre: (body.genre || '').trim(),
      synopsis: (body.synopsis || '').trim(),
      currentPhase: 'setup',
      currentChapter: 0,
      totalWords: 0,
      wordCountTarget: Number(body.wordCountTarget) || 300000,
      status: 'writing',
      createdAt: now,
      updatedAt: now,
    }).run();
    const novel = db.select().from(novels).where(eq(novels.id, id)).get();
    return NextResponse.json(novel, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}