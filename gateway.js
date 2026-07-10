/**
 * Gateway: port 3000 → HTTP:3002 (Next.js), WS:3001 (ws-proxy → tailsshd)
 * Uses ws.WebSocketServer for WS (native framing support, no RSV1 issue)
 * Uses http.request for HTTP proxy (buffered body, no pipe issues)
 */
const http = require('http');
const crypto = require('crypto');
const { WebSocket, WebSocketServer } = require('ws');

const NEXT_PORT = parseInt(process.env.NEXT_PORT || '3002', 10);
const WS_PROXY = process.env.WS_PROXY || 'ws://127.0.0.1:3001';
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '3000', 10);

// ── WS Server ──────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (clientWs, req) => {
  const hostId = (req.url || '').replace(/^\/ws\//, '');
  if (!hostId) { clientWs.close(1002); return; }

  const backend = new WebSocket(WS_PROXY + '/ws/' + hostId);
  clientWs.on('message', (data, isBinary) => {
    if (backend.readyState === WebSocket.OPEN) backend.send(data, { binary: isBinary });
  });
  clientWs.on('close', () => backend.close());
  clientWs.on('error', () => backend.close());
  backend.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });
  backend.onclose = () => { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(); };
  backend.onerror = () => { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(); };
});

// HTTP Server (handles both HTTP requests and WS upgrades)
const server = http.createServer((req, res) => {
  // Read the full incoming body first
  const reqChunks = [];
  req.on('data', (c) => reqChunks.push(c));
  req.on('end', () => {
    const reqBody = Buffer.concat(reqChunks);
    const url = req.url || '';

    // Route /api/tailssh/* to tailsshd (port 9222), everything else to Next.js
    const isTailSSH = url.startsWith('/api/tailssh/');
    const upstreamPort = isTailSSH ? 9222 : NEXT_PORT;

    const proxyReq = http.request({
      hostname: '127.0.0.1', port: upstreamPort,
      path: isTailSSH ? url.replace('/api/tailssh', '') : url,
      method: req.method, headers: req.headers,
    }, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks);
        const cleanHeaders = {};
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (k === 'transfer-encoding' || k === 'content-length') continue;
          if (v != null) cleanHeaders[k] = v;
        }
        cleanHeaders['content-length'] = body.length;
        res.writeHead(proxyRes.statusCode, cleanHeaders);
        res.end(body);
      });
      proxyRes.on('error', (e) => { console.error('[proxy] response error:', e.message); res.end(); });
    });
    const timer = setTimeout(() => {
      console.error('[proxy] upstream timeout');
      proxyReq.destroy();
    }, 25000);
    proxyReq.on('error', (e) => { clearTimeout(timer); console.error('[proxy] request error:', e.message); res.statusCode = 502; res.end(); });
    proxyReq.end(reqBody);
  });
  req.on('error', () => { res.statusCode = 502; res.end(); });
});

// ── WS Upgrade handler ──────────────────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (url.startsWith('/ws/')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`[gateway] :${GATEWAY_PORT} → HTTP:${NEXT_PORT} WS:${WS_PROXY}`);
});