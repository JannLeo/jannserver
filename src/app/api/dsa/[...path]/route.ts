// Proxy: /api/dsa/* -> DSA FastAPI backend (localhost:8083/api/v1/*)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DSA_ORIGIN = 'http://127.0.0.1:8083';
const DSA_PREFIX = '/api/v1/';
const DSA_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_QUERY_LENGTH = 4096;

function buildBackendUrl(pathParts: string[], search = ''): URL | null {
  if (
    !Array.isArray(pathParts)
    || pathParts.length === 0
    || pathParts.length > 16
    || pathParts.some((part) => !part || part === '.' || part === '..' || part.length > 128 || part.includes('\0'))
    || search.length > MAX_QUERY_LENGTH
  ) {
    return null;
  }

  const target = new URL(DSA_ORIGIN);
  target.pathname = `${DSA_PREFIX}${pathParts.map((part) => encodeURIComponent(part)).join('/')}`;
  target.search = search;
  return target;
}

function proxyResponse(upstream: Response): Response {
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers });
}

function proxyError(): Response {
  return Response.json({ error: 'DSA backend unavailable' }, { status: 502 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const requestUrl = new URL(request.url);
  const backendUrl = buildBackendUrl(path, requestUrl.search);
  if (!backendUrl) return Response.json({ error: 'Invalid DSA path or query' }, { status: 400 });

  try {
    const upstream = await fetch(backendUrl, {
      method: 'GET',
      headers: { Accept: request.headers.get('accept') || 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(DSA_TIMEOUT_MS),
    });
    return proxyResponse(upstream);
  } catch (error) {
    console.error('[dsa-proxy] GET failed', error instanceof Error ? error.message : error);
    return proxyError();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendUrl = buildBackendUrl(path);
  if (!backendUrl) return Response.json({ error: 'Invalid DSA path' }, { status: 400 });

  const declaredLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request body too large' }, { status: 413 });
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return Response.json({ error: 'Unable to read request body' }, { status: 400 });
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request body too large' }, { status: 413 });
  }

  try {
    JSON.parse(body || '{}');
  } catch {
    return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  try {
    const upstream = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: request.headers.get('accept') || 'application/json',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(DSA_TIMEOUT_MS),
    });
    return proxyResponse(upstream);
  } catch (error) {
    console.error('[dsa-proxy] POST failed', error instanceof Error ? error.message : error);
    return proxyError();
  }
}
