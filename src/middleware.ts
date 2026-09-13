import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';

const EXACT_PUBLIC_PATHS = new Set([
  '/login',
  '/api/health',
  '/api/init',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/news',
  '/api/trending',
  '/api/usage',
  '/api/tutor',
  '/api/self-study',
  '/api/ai/ask',
  '/api/ai/flashcard',
  '/api/ai/trending-analysis',
  '/api/ai/integrate-repo',
  '/api/ai/quiz',
  '/api/ai/translate',
  '/api/ai/word-definition',
  '/api/ai/daily-summary',
  '/api/dashboard/trending-cached',
  '/api/tts',
  '/api/llm',
  '/api/herdr/snapshot',
  '/api/daily',
  '/api/video-analysis/status',
  '/voice',
  '/speech-to-speech',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  '/shadcn_ui_ui',
]);

// These endpoints intentionally expose nested machine-to-machine routes.
// User-owned CRUD endpoints (tasks/projects/repos/sessions) are deliberately
// omitted so they always pass through the session check below.
const PUBLIC_PREFIXES = [
  '/api/tasks/delegations/',
  '/api/herdr/',
  '/api/tailssh/',
  '/api/video-analysis/jobs/',
  '/_next/',
  '/icons/',
];

function isPublicPath(pathname: string): boolean {
  if (EXACT_PUBLIC_PATHS.has(pathname)) return true;

  // Preserve the root form for prefix-style APIs without making similarly
  // named routes public (for example /api/herdr-evil).
  return PUBLIC_PREFIXES.some((prefix) => {
    const root = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return pathname === root || pathname.startsWith(prefix);
  });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return response;
  }

  // Root → redirect to /login. Authenticated navigation will continue from the
  // application after login rather than serving a stale root response.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const password = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long!';
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

  // CSRF: validate Origin for browser mutations. Requests without Origin are
  // still authenticated and can be used by trusted CLI/API clients.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin) {
      const allowedHosts = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean);

      try {
        const originUrl = new URL(origin);
        const allowed = allowedHosts.some(
          (host) => originUrl.hostname === host || originUrl.hostname.endsWith(`.${host}`),
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
