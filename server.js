const { parse } = require('url');
const next = require('next');
const http = require('http');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

const NATIVE_WS = globalThis.WebSocket;
const TAILSSHD_WS = process.env.TAILSSHD_WS || 'ws://127.0.0.1:9222';

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    // This handler does NOT use bind/apply - directly calls handle
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl).catch((err) => {
      console.error('[server] handler error:', err);
      if (!res.headersSent) res.statusCode = 500;
      res.end('Internal Server Error');
    });
  });

  // WebSocket proxy: /ws/:hostId -> tailsshd
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (clientWs, request) => {
    const url = request.url || '';
    const backendUrl = `${TAILSSHD_WS}${url}`;
    const backend = new NATIVE_WS(backendUrl);
    backend.binaryType = 'arraybuffer';

    clientWs.on('message', (data) => {
      if (backend.readyState === NATIVE_WS.OPEN) {
        backend.send(data.toString());
      }
    });

    backend.onmessage = (e) => {
      if (clientWs.readyState === 1) {
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
      if (backend.readyState === NATIVE_WS.OPEN || backend.readyState === NATIVE_WS.CONNECTING) {
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
      if (backend.readyState === NATIVE_WS.OPEN) backend.close();
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/ws/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  const PORT = parseInt(process.env.PORT || '3000', 10);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`> Ready on http://0.0.0.0:${PORT}`);
  });
}).catch((err) => {
  console.error('[server] prepare failed:', err);
  process.exit(1);
});