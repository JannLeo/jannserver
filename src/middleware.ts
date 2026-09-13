import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { hostnameFromHostHeader, isAllowedHostname } from '@/lib/host-validation';

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

const PUBLIC_PREFIXES = [
  '/_next/',
  '/icons/',
];

const DEV_SESSION_SECRET = 'development-only-session-secret-change-me-123456';

function isPublicPath(pathname: string): boolean {
  if (EXACT_PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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

function isPathOrChild(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function hasMachineKey(req: NextRequest, headerName: string, envName: string): boolean {
  const expected = process.env[envName]?.trim() || '';
  const provided = req.headers.get(headerName)?.trim() || '';
  return expected.length >= 16 && provided.length === expected.length && provided === expected;
}

function machineAuthResponse(req: NextRequest, pathname: string): NextResponse | null {
  if (
    isPathOrChild(pathname, '/api/herdr') &&
    hasMachineKey(req, 'x-herdr-key', 'HERDR_API_KEY')
  ) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return response;
  }

  if (
    isPathOrChild(pathname, '/api/tasks/delegations') &&
    hasMachineKey(req, 'x-delegation-key', 'DELEGATION_API_KEY')
  ) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return response;
  }

  return null;
}

function invalidHost(pathname: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unrecognized Host header' }, { status: 421 });
  }
  return new NextResponse('Unrecognized Host header', { status: 421 });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Validate the actual client-visible Host header rather than req.nextUrl's
  // internally resolved hostname. Standalone Next may use the container hostname
  // for nextUrl even when the incoming request correctly targets 127.0.0.1.
  if (process.env.NODE_ENV === 'production') {
    const requestHostname = hostnameFromHostHeader(req.headers.get('host'));
    if (!requestHostname || !isAllowedHostname(requestHostname)) {
      return invalidHost(pathname);
    }
  }

  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return response;
  }

  // Machine callers can access only their narrowly scoped endpoint families
  // with dedicated keys. Browser callers continue through normal session auth.
  const machineResponse = machineAuthResponse(req, pathname);
  if (machineResponse) return machineResponse;

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
      try {
        if (!isAllowedHostname(new URL(origin).hostname)) {
          return new Response('Forbidden', { status: 403 });
        }
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
