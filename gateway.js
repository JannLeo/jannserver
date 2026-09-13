/**
 * Gateway: port 3000 → HTTP:3002 (Next.js), WS:3001 (ws-proxy → tailsshd)
 * Routes selected HTTP traffic to local services and keeps streaming responses streaming.
 */
'use strict';

const http = require('http');
const { unsealData } = require('iron-session');
const { WebSocket, WebSocketServer } = require('ws');

function boundedInt(raw, fallback, min, max) {
  const value = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const NEXT_PORT = boundedInt(process.env.NEXT_PORT, 3002, 1, 65535);
const WS_PROXY = process.env.WS_PROXY || 'ws://127.0.0.1:3001';
const GATEWAY_PORT = boundedInt(process.env.GATEWAY_PORT, 3000, 1, 65535);
const OPENCODE_PORT = boundedInt(process.env.OPENCODE_PORT, 34567, 1, 65535);
const PROXY_IDLE_TIMEOUT_MS = boundedInt(process.env.PROXY_IDLE_TIMEOUT_MS, 300000, 1000, 30 * 60 * 1000);
const MAX_HTML_REWRITE_BYTES = boundedInt(
  process.env.MAX_HTML_REWRITE_BYTES,
  8 * 1024 * 1024,
  64 * 1024,
  64 * 1024 * 1024,
);
const MAX_WS_PAYLOAD = boundedInt(process.env.MAX_WS_PAYLOAD, 1024 * 1024, 1024, 16 * 1024 * 1024);
const SESSION_COOKIE_NAME = 'workspace_session';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function copyHeaders(headers, { dropContentLength = false } = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (dropContentLength && lower === 'content-length') continue;
    if (value != null) result[key] = value;
  }
  return result;
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

async function isWorkspaceAuthenticated(req) {
  const password = process.env.SESSION_SECRET?.trim() || '';
  if (password.length < 32) {
    console.error('[gateway] SESSION_SECRET is missing or shorter than 32 characters');
    return false;
  }

  const seal = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  if (!seal) return false;

  try {
    const session = await unsealData(seal, { password });
    return Boolean(session && session.userId);
  } catch (error) {
    console.warn('[gateway] rejected invalid session cookie:', error?.message || error);
    return false;
  }
}

function sendUnauthorized(res) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(401, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end('Unauthorized');
}

function rejectUpgrade(socket) {
  if (!socket.destroyed) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  }
  socket.destroy();
}

function sendProxyError(res, error, label = 'proxy') {
  console.error(`[${label}]`, error?.message || error);
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy(error instanceof Error ? error : undefined);
    return;
  }
  res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Bad Gateway');
}

function pipeRequestBody(req, proxyReq) {
  req.pipe(proxyReq);
  req.on('aborted', () => proxyReq.destroy());
  req.on('error', (error) => proxyReq.destroy(error));
}

function proxyHttp(req, res, { port, path, rewriteCodingHtml = false }) {
  const requestHeaders = copyHeaders(req.headers);

  // The coding HTML shell is rewritten below. Ask upstream for identity encoding
  // so string replacement never runs against gzip/br compressed bytes.
  if (rewriteCodingHtml) requestHeaders['accept-encoding'] = 'identity';

  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port,
    path,
    method: req.method,
    headers: requestHeaders,
  }, (proxyRes) => {
    const statusCode = proxyRes.statusCode || 502;
    const contentType = String(proxyRes.headers['content-type'] || '');
    const contentEncoding = String(proxyRes.headers['content-encoding'] || '').toLowerCase();
    const shouldRewriteHtml = rewriteCodingHtml
      && contentType.includes('text/html')
      && (!contentEncoding || contentEncoding === 'identity');

    // The OpenCode HTML shell needs absolute paths rewritten. Buffer only while
    // it remains below the configured limit; if it grows larger, immediately
    // switch to streaming passthrough so memory usage stays bounded.
    if (shouldRewriteHtml) {
      const chunks = [];
      let totalBytes = 0;
      let passthrough = false;

      const startPassthrough = () => {
        if (passthrough) return;
        passthrough = true;
        console.warn(`[proxy:coding] HTML rewrite skipped (> ${MAX_HTML_REWRITE_BYTES} bytes)`);
        const headers = copyHeaders(proxyRes.headers, { dropContentLength: true });
        res.writeHead(statusCode, headers);
        for (const buffered of chunks) res.write(buffered);
        chunks.length = 0;
      };

      proxyRes.on('data', (chunk) => {
        if (res.destroyed || res.writableEnded) return;
        if (passthrough) {
          res.write(chunk);
          return;
        }

        totalBytes += chunk.length;
        if (totalBytes > MAX_HTML_REWRITE_BYTES) {
          startPassthrough();
          res.write(chunk);
          return;
        }
        chunks.push(chunk);
      });

      proxyRes.on('end', () => {
        if (res.destroyed || res.writableEnded) return;
        if (passthrough) {
          res.end();
          return;
        }

        const raw = Buffer.concat(chunks, totalBytes);
        const html = raw.toString('utf8')
          .replace(/src="\//g, 'src="/coding-proxy/')
          .replace(/href="\//g, 'href="/coding-proxy/');
        const body = Buffer.from(html, 'utf8');
        const headers = copyHeaders(proxyRes.headers, { dropContentLength: true });
        headers['content-length'] = body.length;
        headers['cache-control'] = 'no-cache, no-store, must-revalidate';
        res.writeHead(statusCode, headers);
        res.end(body);
      });

      proxyRes.on('aborted', () => {
        if (!res.writableEnded) res.destroy(new Error('upstream response aborted'));
      });
      proxyRes.on('error', (error) => sendProxyError(res, error, 'proxy:coding-response'));
      return;
    }

    const headers = copyHeaders(proxyRes.headers);
    const url = req.url || '';
    if (!rewriteCodingHtml && (contentType.includes('text/html') || url.endsWith('/') || !url.includes('.'))) {
      headers['cache-control'] = 'no-cache, no-store, must-revalidate';
    }

    res.writeHead(statusCode, headers);
    proxyRes.pipe(res);
    proxyRes.on('aborted', () => {
      if (!res.writableEnded) res.destroy(new Error('upstream response aborted'));
    });
    proxyRes.on('error', (error) => sendProxyError(res, error, 'proxy:response'));
  });

  proxyReq.setTimeout(PROXY_IDLE_TIMEOUT_MS, () => {
    proxyReq.destroy(new Error(`upstream idle timeout after ${PROXY_IDLE_TIMEOUT_MS}ms`));
  });

  proxyReq.on('error', (error) => sendProxyError(res, error, 'proxy:request'));
  res.on('close', () => {
    if (!res.writableEnded) proxyReq.destroy();
  });

  pipeRequestBody(req, proxyReq);
}

// ── TailSSH WS server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });
wss.on('connection', (clientWs, req) => {
  let hostId = '';
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    hostId = parsed.pathname.replace(/^\/ws\//, '');
  } catch {
    clientWs.close(1002);
    return;
  }

  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(hostId)) {
    clientWs.close(1008);
    return;
  }

  const backendBase = WS_PROXY.replace(/\/$/, '');
  const backend = new WebSocket(`${backendBase}/ws/${encodeURIComponent(hostId)}`, {
    maxPayload: MAX_WS_PAYLOAD,
  });
  clientWs.on('message', (data, isBinary) => {
    if (backend.readyState === WebSocket.OPEN) backend.send(data, { binary: isBinary });
  });
  clientWs.on('close', () => {
    if (backend.readyState === WebSocket.OPEN || backend.readyState === WebSocket.CONNECTING) backend.close();
  });
  clientWs.on('error', () => {
    if (backend.readyState === WebSocket.OPEN || backend.readyState === WebSocket.CONNECTING) backend.close();
  });
  backend.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });
  backend.on('close', () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });
  backend.on('error', () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011);
  });
});

// HTTP server (handles both HTTP requests and WS upgrades)
const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const isVibe = url === '/vibe' || url.startsWith('/vibe/');
  const isCoding = url === '/coding-proxy' || url.startsWith('/coding-proxy/');

  // TailSSH HTTP is intentionally NOT intercepted here anymore. It goes through
  // Next.js /api/tailssh where the normal workspace middleware authenticates it.
  if ((isVibe || isCoding) && !(await isWorkspaceAuthenticated(req))) {
    sendUnauthorized(res);
    return;
  }

  const upstreamPort = isVibe ? 8899 : isCoding ? OPENCODE_PORT : NEXT_PORT;
  const upstreamPath = isVibe
    ? url.replace(/^\/vibe/, '') || '/'
    : isCoding
      ? url.replace(/^\/coding-proxy/, '') || '/'
      : url;

  proxyHttp(req, res, {
    port: upstreamPort,
    path: upstreamPath,
    rewriteCodingHtml: isCoding,
  });
});

// ── OpenCode WS server ──────────────────────────────────────────────────────
const codingWss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });
codingWss.on('connection', (clientWs, req) => {
  const backendPath = (req.url || '').replace(/^\/coding-proxy/, '') || '/';
  const backend = new WebSocket(`ws://127.0.0.1:${OPENCODE_PORT}${backendPath}`, {
    maxPayload: MAX_WS_PAYLOAD,
  });
  clientWs.on('message', (data, isBinary) => {
    if (backend.readyState === WebSocket.OPEN) backend.send(data, { binary: isBinary });
  });
  clientWs.on('close', () => {
    if (backend.readyState === WebSocket.OPEN || backend.readyState === WebSocket.CONNECTING) backend.close();
  });
  clientWs.on('error', () => {
    if (backend.readyState === WebSocket.OPEN || backend.readyState === WebSocket.CONNECTING) backend.close();
  });
  backend.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });
  backend.on('close', () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });
  backend.on('error', () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011);
  });
});

// ── WS upgrade handler ──────────────────────────────────────────────────────
server.on('upgrade', async (req, socket, head) => {
  const url = req.url || '';
  const isTailSshWs = url.startsWith('/ws/');
  const isCodingWs = url === '/coding-proxy' || url.startsWith('/coding-proxy/');

  if (!isTailSshWs && !isCodingWs) {
    socket.destroy();
    return;
  }

  if (!(await isWorkspaceAuthenticated(req))) {
    rejectUpgrade(socket);
    return;
  }

  if (isTailSshWs) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
    return;
  }

  codingWss.handleUpgrade(req, socket, head, (ws) => {
    codingWss.emit('connection', ws, req);
  });
});

server.on('clientError', (error, socket) => {
  console.error('[gateway] client error:', error.message);
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`[gateway] :${GATEWAY_PORT} → HTTP:${NEXT_PORT} WS:${WS_PROXY}`);
});
