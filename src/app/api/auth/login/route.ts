import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import {
  sessionOptions,
  checkRateLimit,
  recordFailure,
  clearFailures,
  getRateLimitConfig,
} from '@/lib/auth';
import type { SessionData } from '@/lib/auth';
import { db } from '@/lib/db/index';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { compare } from 'bcryptjs';

function clientAddress(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return realIp || forwarded || 'unknown';
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }

  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password) {
    return NextResponse.json({ error: '用户名和密码必填' }, { status: 400 });
  }
  if (username.length > 128 || password.length > 4096) {
    return NextResponse.json({ error: '用户名或密码格式无效' }, { status: 400 });
  }

  // Apply two independent limits. Even if a deployment trusts spoofable proxy
  // headers, rotating the apparent IP cannot bypass the per-username limit.
  const ipKey = `ip:${clientAddress(req)}`;
  const userKey = `user:${username.toLowerCase()}`;
  const [ipLimit, userLimit] = await Promise.all([
    checkRateLimit(ipKey),
    checkRateLimit(userKey),
  ]);

  if (!ipLimit.allowed || !userLimit.allowed) {
    const { windowMs } = getRateLimitConfig();
    const minutes = Math.max(1, Math.ceil(windowMs / 60_000));
    return NextResponse.json(
      { error: `登录失败次数过多，请约 ${minutes} 分钟后再试` },
      { status: 429 },
    );
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();
  const valid = user ? await compare(password, user.passwordHash) : false;

  if (!user || !valid) {
    await Promise.all([recordFailure(ipKey), recordFailure(userKey)]);
    return NextResponse.json(
      {
        error: '用户名或密码错误',
        remaining: Math.max(0, Math.min(ipLimit.remaining, userLimit.remaining) - 1),
      },
      { status: 401 },
    );
  }

  await clearFailures(ipKey, userKey);

  const res = NextResponse.json({ ok: true, username: user.username });
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.userId = user.id;
  session.username = user.username;
  session.isLoggedIn = true;
  await session.save();

  return res;
}
