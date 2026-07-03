import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, checkRateLimit, recordFailure } from '@/lib/auth';
import type { SessionData } from '@/lib/auth';
import { db } from '@/lib/db/index';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { compare } from 'bcryptjs';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'localhost';

  const { allowed, remaining } = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ error: '登录失败次数过多，请 15 分钟后再试' }, { status: 429 });
  }

  const body = await req.json();
  const { username, password } = body || {};
  if (!username || !password) {
    return NextResponse.json({ error: '用户名和密码必填' }, { status: 400 });
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user) {
    await recordFailure(ip);
    return NextResponse.json({ error: '用户名或密码错误', remaining: remaining - 1 }, { status: 401 });
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    await recordFailure(ip);
    return NextResponse.json({ error: '用户名或密码错误', remaining: remaining - 1 }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, username: user.username });
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.userId = user.id;
  session.username = user.username;
  session.isLoggedIn = true;
  await session.save();

  return res;
}