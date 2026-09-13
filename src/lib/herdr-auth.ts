/**
 * herdr-auth.ts
 * x-herdr-key header validation + local-only guard.
 *
 * Security model:
 *  - Remote callers MUST provide a valid HERDR_API_KEY match.
 *  - Local calls (same host, 127.0.0.1, ::1) skip key check for convenience.
 *
 * Usage in route handlers:
 *   import { herdrAuth } from '@/lib/herdr-auth';
 *   const auth = await herdrAuth(req);
 *   if (auth.error) return auth.error;
 */

import { NextRequest, NextResponse } from 'next/server';

export interface AuthResult {
  ok: true;
  local: boolean;
}

export interface AuthError {
  ok: false;
  error: NextResponse;
}

const HERDR_API_KEY = process.env.HERDR_API_KEY || '';

function isLocalRequest(req: NextRequest): boolean {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === ''
  );
}

export async function herdrAuth(req: NextRequest): Promise<AuthResult | AuthError> {
  // Local requests bypass key check
  if (isLocalRequest(req)) {
    return { ok: true, local: true };
  }

  // No key configured → reject all remote requests
  if (!HERDR_API_KEY) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: 'herdr API not configured (HERDR_API_KEY not set)' },
        { status: 503 }
      ),
    };
  }

  const provided = req.headers.get('x-herdr-key') || '';
  if (!provided) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: 'Missing x-herdr-key header' },
        { status: 401 }
      ),
    };
  }

  if (provided !== HERDR_API_KEY) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'Invalid x-herdr-key' }, { status: 403 }),
    };
  }

  return { ok: true, local: false };
}
