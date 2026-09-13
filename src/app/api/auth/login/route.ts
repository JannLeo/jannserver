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

// Structurally valid bcrypt hash with cost 12. The payload is intentionally not
// tied to any real account. Comparing against it keeps unknown-user attempts on
// roughly the same CPU path as wrong-password attempts for existing users.
const DUMMY_PASSWORD_HASH = '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

function clientAddress(req: NextRequest): string | null {
  // Forwarded headers are client-controlled unless the deployment has an
  // explicitly trusted reverse proxy/gateway that overwrites them.
  if (process.env.TRUST_PROXY_HEADERS !== 'true') return null;

  const realIp = req.headers.get('x-real-ip')?.trim();
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = realIp || forwarded || '';
  return address.slice(0, 128) || null;
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

  const userKey = `user:${username.toLowerCase()}`;
  const address = clientAddress(req);
  const ipKey = address ? `ip:${address}` : null;

  const userLimit = await checkRateLimit(userKey);
  const ipLimit = ipKey ? await checkRateLimit(ipKey) : null;

  if (!userLimit.allowed || (ipLimit && !ipLimit.allowed)) {
    const { windowMs } = getRateLimitConfig();
    const minutes = Math.max(1, Math.ceil(windowMs / 60_000));
    return NextResponse.json(
      { error: `登录失败次数过多，请约 ${minutes} 分钟后再试` },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();
  const valid = await compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);

  if (!user || !valid) {
    await recordFailure(userKey);
    if (ipKey) await recordFailure(ipKey);

    const remaining = ipLimit
      ? Math.min(userLimit.remaining, ipLimit.remaining)
      : userLimit.remaining;

    return NextResponse.json(
      {
        error: '用户名或密码错误',
        remaining: Math.max(0, remaining - 1),
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  await clearFailures(userKey, ...(ipKey ? [ipKey] : []));

  const res = NextResponse.json(
    { ok: true, username: user.username },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.userId = user.id;
  session.username = user.username;
  session.isLoggedIn = true;
  await session.save();

  return res;
}
