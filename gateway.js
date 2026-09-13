/**
 * Gateway: port 3000 → HTTP:3002 (Next.js), WS:3001 (ws-proxy → tailsshd)
 * Routes selected HTTP traffic to local services and keeps streaming responses streaming.
 */
const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');

const NEXT_PORT = parseInt(process.env.NEXT_PORT || '3002', 10);
const WS_PROXY = process.env.WS_PROXY || 'ws://127.0.0.1:3001';
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '3000', 10);
const OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || '34567', 10);
const PROXY_IDLE_TIMEOUT_MS = parseInt(process.env.PROXY_IDLE_TIMEOUT_MS || '300000', 10);
const MAX_HTML_REWRITE_BYTES = parseInt(process.env.MAX_HTML_REWRITE_BYTES || String(8 * 1024 * 1024), 10);

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

  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port,
    path,
    method: req.method,
    headers: requestHeaders,
  }, (proxyRes) => {
    const statusCode = proxyRes.statusCode || 502;
    const contentType = String(proxyRes.headers['content-type'] || '');
    const shouldRewriteHtml = rewriteCodingHtml && contentType.includes('text/html');

    // The OpenCode HTML shell needs absolute paths rewritten. Everything else stays
    // streaming so SSE/AI responses and large downloads are not buffered in memory.
    if (shouldRewriteHtml) {
      const chunks = [];
      let totalBytes = 0;
      let exceededLimit = false;

      proxyRes.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_HTML_REWRITE_BYTES) exceededLimit = true;
        chunks.push(chunk);
      });

      proxyRes.on('end', () => {
        if (res.destroyed || res.writableEnded) return;

        const raw = Buffer.concat(chunks);
        if (exceededLimit) {
          console.warn(`[proxy:coding] HTML rewrite skipped (${raw.length} bytes > ${MAX_HTML_REWRITE_BYTES})`);
          const headers = copyHeaders(proxyRes.headers, { dropContentLength: true });
          headers['content-length'] = raw.length;
          res.writeHead(statusCode, headers);
          res.end(raw);
          return;
        }

        const html = raw.toString('utf8')
          .replace(/src="\//g, 'src="/coding-proxy/')
          .replace(/href="\//g, 'href="/coding-proxy/');
        const body = Buffer.from(html, 'utf8');
        const headers = copyHeaders(proxyRes.headers, { dropContentLength: true });
        headers['content-length'] = body.length;
        res.writeHead(statusCode, headers);
        res.end(body);
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
    proxyRes.on('error', (error) => sendProxyError(res, error, 'proxy:response'));
  });

  // Idle timeout resets as data flows, unlike the old one-shot timer which could
  // terminate healthy long-running requests after five minutes.
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
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (clientWs, req) => {
  const hostId = (req.url || '').replace(/^\/ws\//, '');
  if (!hostId) {
    clientWs.close(1002);
    return;
  }

  const backend = new WebSocket(WS_PROXY + '/ws/' + hostId);
  clientWs.on('message', (data, isBinary) => {
    if (backend.readyState === WebSocket.OPEN) backend.send(data, { binary: isBinary });
  });
  clientWs.on('close', () => backend.close());
  clientWs.on('error', () => backend.close());
  backend.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });
  backend.onclose = () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  };
  backend.onerror = () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  };
});

// HTTP server (handles both HTTP requests and WS upgrades)
const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const isTailSSH = url.startsWith('/api/tailssh/');
  const isVibe = url.startsWith('/vibe/');
  const isCoding = url.startsWith('/coding-proxy/');

  const upstreamPort = isTailSSH ? 9222 : isVibe ? 8899 : isCoding ? OPENCODE_PORT : NEXT_PORT;
  const upstreamPath = isTailSSH
    ? url.replace('/api/tailssh', '')
    : isVibe
      ? url.replace('/vibe', '')
      : isCoding
        ? url.replace('/coding-proxy', '')
        : url;

  proxyHttp(req, res, {
    port: upstreamPort,
    path: upstreamPath || '/',
    rewriteCodingHtml: isCoding,
  });
});

// ── OpenCode WS server ──────────────────────────────────────────────────────
const codingWss = new WebSocketServer({ noServer: true });
codingWss.on('connection', (clientWs, req) => {
  const backendPath = (req.url || '').replace(/^\/coding-proxy/, '') || '/';
  const backend = new WebSocket('ws://127.0.0.1:' + OPENCODE_PORT + backendPath);
  clientWs.on('message', (data, isBinary) => {
    if (backend.readyState === WebSocket.OPEN) backend.send(data, { binary: isBinary });
  });
  clientWs.on('close', () => backend.close());
  clientWs.on('error', () => backend.close());
  backend.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });
  backend.onclose = () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  };
  backend.onerror = () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  };
});

// ── WS upgrade handler ──────────────────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (url.startsWith('/ws/')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else if (url.startsWith('/coding-proxy/')) {
    codingWss.handleUpgrade(req, socket, head, (ws) => {
      codingWss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.on('clientError', (error, socket) => {
  console.error('[gateway] client error:', error.message);
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`[gateway] :${GATEWAY_PORT} → HTTP:${NEXT_PORT} WS:${WS_PROXY}`);
});
