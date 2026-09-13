/**
 * WebSocket proxy: /ws/:hostId -> backend ws://127.0.0.1:9222/ws/:hostId
 * Uses native WebSocket (globalThis.WebSocket) for backend connection,
 * compatible with how browsers connect to tailsshd.
 * Listens on PORT 3001 (same origin as workspace via Cloudflare Tunnel).
 */
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PROXY_PORT || '3001', 10);
const BACKEND_WS = process.env.BACKEND_WS || 'ws://127.0.0.1:9222';

const NativeWebSocket = globalThis.WebSocket;

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWs, request) => {
  const url = request.url || '';
  const backendUrl = `${BACKEND_WS}${url}`;

  const backend = new NativeWebSocket(backendUrl);
  backend.binaryType = 'arraybuffer';

  // Client → backend: always send as text (tailsshd expects TEXT frames)
  clientWs.on('message', (data) => {
    if (backend.readyState === NativeWebSocket.OPEN) {
      backend.send(data.toString());
    }
  });

  // Backend → client: preserve data type
  backend.onmessage = (e) => {
    if (clientWs.readyState === 1) { // WebSocket.OPEN
      if (typeof e.data === 'string') {
        clientWs.send(e.data);
      } else if (e.data instanceof ArrayBuffer) {
        clientWs.send(e.data);
      } else {
        clientWs.send(String(e.data));
      }
    }
  };

  clientWs.on('close', () => {
    if (backend.readyState === NativeWebSocket.OPEN || backend.readyState === NativeWebSocket.CONNECTING) {
      backend.close();
    }
  });

  backend.onclose = () => {
    if (clientWs.readyState === 1) {
      clientWs.close();
    }
  };

  backend.onerror = () => {
    if (clientWs.readyState === 1) {
      clientWs.close(1011);
    }
  };

  clientWs.on('error', () => {
    if (backend.readyState === NativeWebSocket.OPEN) {
      backend.close();
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  const url = request.url;
  if (url && url.startsWith('/ws/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0');
server.on('error', (err) => console.error('[WS-Proxy] Error:', err.message));