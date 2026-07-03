import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { tags } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/tags
export async function GET() {
  initDb();
  return NextResponse.json(db.select().from(tags).all());
}

// POST /api/tags
export async function POST(req: NextRequest) {
  initDb();
  const { name, color } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const id = uuidv4();
  db.insert(tags).values({ id, name, color: color || '#6b7280' }).run();
  return NextResponse.json({ id });
}