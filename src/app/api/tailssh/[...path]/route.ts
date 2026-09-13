import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAILSSH_BACKEND = process.env.TAILSSH_BACKEND || 'http://127.0.0.1:9222';
const TAILSSH_TIMEOUT_MS = Math.min(
  120_000,
  Math.max(1_000, Number.parseInt(process.env.TAILSSH_TIMEOUT_MS || '15000', 10) || 15_000),
);

function buildTarget(pathParts: string[], search: string): URL | null {
  if (
    !Array.isArray(pathParts) ||
    pathParts.length === 0 ||
    pathParts.some((part) => !part || part === '.' || part === '..' || part.length > 256)
  ) {
    return null;
  }

  try {
    const base = new URL(TAILSSH_BACKEND);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
    const encodedPath = pathParts.map((part) => encodeURIComponent(part)).join('/');
    const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
    base.pathname = `${basePath}${encodedPath}`;
    base.search = search;
    return base;
  } catch {
    return null;
  }
}

function upstreamHeaders(request: NextRequest, hasBody: boolean): Headers {
  const headers = new Headers();
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);
  if (hasBody) {
    headers.set('content-type', request.headers.get('content-type') || 'application/json');
  }
  return headers;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: 'GET' | 'POST' | 'DELETE',
) {
  const { path } = await context.params;
  const target = buildTarget(path, request.nextUrl.search);
  if (!target) {
    return NextResponse.json({ error: 'Invalid TailSSH path or backend configuration' }, { status: 400 });
  }

  try {
    const hasBody = method === 'POST';
    const body = hasBody ? await request.text() : undefined;
    if (body && body.length > 1024 * 1024) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }

    const upstream = await fetch(target, {
      method,
      headers: upstreamHeaders(request, hasBody),
      body,
      signal: AbortSignal.timeout(TAILSSH_TIMEOUT_MS),
      cache: 'no-store',
    });

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('cache-control', 'no-store');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error: any) {
    console.error('[tailssh-proxy]', error?.message || error);
    return NextResponse.json({ error: 'TailSSH backend unavailable' }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context, 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context, 'POST');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, context, 'DELETE');
}
