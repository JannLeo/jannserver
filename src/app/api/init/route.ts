import { NextRequest, NextResponse } from 'next/server';
import { initDb, db } from '@/lib/db/index';
import { users } from '@/lib/db/schema';
import { hashSync } from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // 检查 INIT_TOKEN
  const initToken = req.headers.get('x-init-token');
  const expected = process.env.INIT_TOKEN;
  if (!expected || initToken !== expected) {
    return NextResponse.json({ error: 'Invalid init token' }, { status: 403 });
  }

  initDb();

  // users 表非空则拒绝
  const existing = db.select().from(users).all();
  if (existing.length > 0) {
    return NextResponse.json({ error: 'System already initialized' }, { status: 403 });
  }

  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
  }

  const now = new Date().toISOString();
  db.insert(users).values({
    username,
    passwordHash: hashSync(password, 10),
    createdAt: now,
  }).run();

  // auto login
  const newUser = db.select().from(users).all()[0];
  const res = NextResponse.json({ ok: true, username: newUser.username });
  const session = await getIronSession(req, res, sessionOptions);
  (session as any).userId = newUser.id;
  (session as any).username = newUser.username;
  await session.save();

  return res;
}