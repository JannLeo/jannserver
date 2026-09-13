import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';

const EXACT_PUBLIC_PATHS = new Set([
  '/login',
  '/api/health',
  '/api/init',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  '/shadcn_ui_ui',
]);

// Machine-to-machine endpoints stay reachable without a workspace cookie, but
// each route is responsible for validating its dedicated API key. Everything
// else under /api requires the normal workspace session.
const PUBLIC_PREFIXES = [
  '/api/tasks/delegations/',
  '/api/herdr/',
  '/_next/',
  '/icons/',
];

const DEV_SESSION_SECRET = 'development-only-session-secret-change-me-123456';

function isPublicPath(pathname: string): boolean {
  if (EXACT_PUBLIC_PATHS.has(pathname)) return true;

  return PUBLIC_PREFIXES.some((prefix) => {
    const root = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return pathname === root || pathname.startsWith(prefix);
  });
}

function sessionSecret(): string | null {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') return null;
  return DEV_SESSION_SECRET;
}

function serviceMisconfigured(pathname: string) {
  console.error('[middleware] SESSION_SECRET is missing or shorter than 32 characters');
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Server authentication is not configured' }, { status: 503 });
  }
  return new NextResponse('Server authentication is not configured', { status: 503 });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return response;
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const password = sessionSecret();
  if (!password) return serviceMisconfigured(pathname);

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  let session: { userId?: number } | undefined;
  try {
    session = await getIronSession<{ userId?: number }>(req, response, {
      password,
      cookieName: 'workspace_session',
      cookieOptions: {
        secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_HTTP_COOKIES !== 'true',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      },
    });
  } catch (error) {
    console.error('[middleware] failed to read session', error);
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (!session?.userId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Browser mutations must come from an explicitly allowed hostname. CLI and
  // machine clients without Origin remain protected by session/API-key auth.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin) {
      const allowedHosts = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);

      try {
        const originUrl = new URL(origin);
        const hostname = originUrl.hostname.toLowerCase();
        const allowed = allowedHosts.some(
          (host) => hostname === host || hostname.endsWith(`.${host}`),
        );
        if (!allowed) return new Response('Forbidden', { status: 403 });
      } catch {
        return new Response('Forbidden', { status: 403 });
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
