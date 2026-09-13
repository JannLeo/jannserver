/**
 * Herdr route authentication.
 *
 * Browser/UI calls authenticate with the normal workspace session cookie.
 * Machine-to-machine calls authenticate with x-herdr-key / HERDR_API_KEY.
 * We intentionally do not infer trust from x-forwarded-for/x-real-ip because
 * those headers can be absent or spoofed when the service is directly exposed.
 */

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export interface AuthResult {
  ok: true;
  // Kept for compatibility with existing route handlers. A session-authenticated
  // caller is treated as a trusted interactive/local caller.
  local: boolean;
  method: 'session' | 'api-key';
}

export interface AuthError {
  ok: false;
  error: NextResponse;
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function herdrAuth(req: NextRequest): Promise<AuthResult | AuthError> {
  try {
    const session = await getSession();
    if (session.userId) {
      return { ok: true, local: true, method: 'session' };
    }
  } catch (error) {
    console.error('[herdr-auth] failed to read workspace session', error);
  }

  const expected = process.env.HERDR_API_KEY?.trim() || '';
  const provided = req.headers.get('x-herdr-key')?.trim() || '';

  if (!expected) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: 'Unauthorized. Sign in or configure HERDR_API_KEY for machine access.' },
        { status: 401 },
      ),
    };
  }

  if (!provided) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'Missing x-herdr-key header' }, { status: 401 }),
    };
  }

  if (!secureEqual(provided, expected)) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'Invalid x-herdr-key' }, { status: 403 }),
    };
  }

  return { ok: true, local: false, method: 'api-key' };
}
