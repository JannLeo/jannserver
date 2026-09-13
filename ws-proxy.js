/**
 * Internal WebSocket proxy: /ws/:hostId -> tailsshd.
 * External clients should connect through gateway.js, which authenticates the
 * workspace session before forwarding the upgrade here.
 */
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PROXY_PORT || '3001', 10);
const HOST = process.env.PROXY_HOST || '127.0.0.1';
const BACKEND_WS = process.env.BACKEND_WS || 'ws://127.0.0.1:9222';
const MAX_WS_PAYLOAD = parseInt(process.env.MAX_WS_PAYLOAD || String(1024 * 1024), 10);

const NativeWebSocket = globalThis.WebSocket;

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

  const backend = new NativeWebSocket(`${BACKEND_WS}/ws/${encodeURIComponent(hostId)}`);
  backend.binaryType = 'arraybuffer';

  clientWs.on('message', (data) => {
    if (backend.readyState === NativeWebSocket.OPEN) {
      backend.send(data.toString());
    }
  });

  backend.onmessage = (event) => {
    if (clientWs.readyState !== 1) return;
    if (typeof event.data === 'string') {
      clientWs.send(event.data);
    } else if (event.data instanceof ArrayBuffer) {
      clientWs.send(event.data);
    } else {
      clientWs.send(String(event.data));
    }
  };

  clientWs.on('close', () => {
    if (backend.readyState === NativeWebSocket.OPEN || backend.readyState === NativeWebSocket.CONNECTING) {
      backend.close();
    }
  });

  backend.onclose = () => {
    if (clientWs.readyState === 1) clientWs.close();
  };

  backend.onerror = () => {
    if (clientWs.readyState === 1) clientWs.close(1011);
  };

  clientWs.on('error', () => {
    if (backend.readyState === NativeWebSocket.OPEN || backend.readyState === NativeWebSocket.CONNECTING) {
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
