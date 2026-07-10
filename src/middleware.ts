import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';

// Separate lightweight rate-limit check for middleware (Edge-compatible, no Node.js modules)
async function checkRateLimitEdge(key: string): Promise<{ allowed: boolean }> {
  // Use fetch to a tiny API endpoint for rate limiting
  // For now, skip rate limiting in middleware — API routes enforce it
  return { allowed: true };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths (no auth needed)
  const publicPaths = [
    '/login', '/api/health', '/api/init',
    '/api/auth/login', '/api/auth/logout', '/api/auth/me',
    '/api/news', '/api/trending', '/api/usage',
    '/api/tasks', '/api/projects', '/api/repos',
    '/api/tutor', '/api/self-study', '/api/ai/ask', '/api/ai/flashcard',
 '/api/ai/trending-analysis', '/api/ai/integrate-repo',
    '/api/llm', '/api/herdr/snapshot', '/api/sessions',
    '/api/tasks/delegations',
    '/api/ai/daily-summary', '/api/daily',
    '/api/tailssh',
    '/api/video-analysis/status', '/api/video-analysis/jobs',
    '/_next/', '/favicon.ico',
    // PWA assets
    '/manifest.json', '/sw.js',
    '/icons/',
    '/shadcn_ui_ui',
  ];
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Root → redirect to /login or /dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Auth check
  const password = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long!';
  const cookieName = 'workspace_session';
  const res = NextResponse.next();
  let session: any;
  try {
    session = await getIronSession(req, res, {
      password,
      cookieName,
      cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60,
      },
    });
  } catch (e) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (!session?.userId) {
    // API routes → return JSON 401 instead of redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // CSRF: Origin check for mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin) {
      const allowed = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1').split(',');
      try {
        const url = new URL(origin);
        const ok = allowed.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`));
        if (!ok) return new Response('Forbidden', { status: 403 });
      } catch {
        return new Response('Forbidden', { status: 403 });
      }
    }
    // No origin header on curl requests: skip for now (API routes enforce auth)
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};