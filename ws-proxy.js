/**
 * Internal WebSocket proxy: /ws/:hostId -> tailsshd.
 * External clients should connect through gateway.js, which authenticates the
 * workspace session before forwarding the upgrade here.
 */
'use strict';

const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');

function boundedInt(raw, fallback, min, max) {
  const value = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const PORT = boundedInt(process.env.PROXY_PORT, 3001, 1, 65535);
const HOST = process.env.PROXY_HOST || '127.0.0.1';
const BACKEND_WS = process.env.BACKEND_WS || 'ws://127.0.0.1:9222';
const MAX_WS_PAYLOAD = boundedInt(process.env.MAX_WS_PAYLOAD, 1024 * 1024, 1024, 16 * 1024 * 1024);

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });

wss.on('connection', (clientWs, request) => {
  let hostId = '';
  try {
    const parsed = new URL(request.url || '/', 'http://localhost');
    hostId = decodeURIComponent(parsed.pathname.replace(/^\/ws\//, ''));
  } catch {
    clientWs.close(1002);
    return;
  }

  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(hostId)) {
    clientWs.close(1008);
    return;
  }

  const backendBase = BACKEND_WS.replace(/\/$/, '');
  const backend = new WebSocket(`${backendBase}/ws/${encodeURIComponent(hostId)}`, {
    maxPayload: MAX_WS_PAYLOAD,
  });

  clientWs.on('message', (data, isBinary) => {
    if (backend.readyState === WebSocket.OPEN) {
      backend.send(data, { binary: isBinary });
    }
  });

  backend.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('close', () => {
    if (backend.readyState === WebSocket.OPEN || backend.readyState === WebSocket.CONNECTING) {
      backend.close();
    }
  });

  backend.on('close', () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  backend.on('error', () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011);
  });

  clientWs.on('error', () => {
    if (backend.readyState === WebSocket.OPEN || backend.readyState === WebSocket.CONNECTING) {
      backend.close();
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  const url = request.url || '';
  if (!url.startsWith('/ws/')) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[WS-Proxy] listening on ${HOST}:${PORT}`);
});
server.on('error', (err) => console.error('[WS-Proxy] Error:', err.message));
