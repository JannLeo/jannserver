import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { initDb, db, sqlite } from '@/lib/db/index';
import { users } from '@/lib/db/schema';
import { hashSync } from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/auth';
import type { SessionData } from '@/lib/auth';

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// GET /api/init - only expose whether first-run initialization is needed.
export async function GET() {
  initDb();
  const existing = db.select({ id: users.id }).from(users).limit(1).all();
  return NextResponse.json(
    { initialized: existing.length > 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// POST /api/init - perform one-time initialization.
export async function POST(req: NextRequest) {
  const provided = req.headers.get('x-init-token')?.trim() || '';
  const expected = process.env.INIT_TOKEN?.trim() || '';

  if (expected.length < 16) {
    console.error('[init] INIT_TOKEN is missing or too short');
    return NextResponse.json(
      { error: 'Initialization is not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!provided || !secureEqual(provided, expected)) {
    return NextResponse.json(
      { error: 'Invalid init token' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be JSON' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username || username.length > 128) {
    return NextResponse.json(
      { error: 'Username is required and must be <= 128 characters' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (password.length < 12 || password.length > 4096) {
    return NextResponse.json(
      { error: 'Password must be between 12 and 4096 characters' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  initDb();
  const passwordHash = hashSync(password, 12);
  const now = new Date().toISOString();

  // Keep "is the system initialized?" and the first insert in one IMMEDIATE
  // SQLite transaction. Concurrent init requests serialize here, so only one
  // request can create the initial user even when usernames differ.
  const createInitialUser = sqlite.transaction(() => {
    const existing = sqlite.prepare('SELECT id FROM users LIMIT 1').get() as { id: number } | undefined;
    if (existing) return null;

    const result = sqlite.prepare(
      'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
    ).run(username, passwordHash, now);

    return { id: Number(result.lastInsertRowid), username };
  });

  const inserted = createInitialUser();
  if (!inserted) {
    return NextResponse.json(
      { error: 'System already initialized' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const res = NextResponse.json(
    { ok: true, username: inserted.username },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.userId = inserted.id;
  session.username = inserted.username;
  session.isLoggedIn = true;
  await session.save();

  return res;
}
