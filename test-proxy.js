#!/usr/bin/env node
// Echo test proxy on port 3003
const { WebSocketServer } = require('ws');
const http = require('http');
const NWS = globalThis.WebSocket;

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWs, req) => {
  const url = req.url || '/';
  const backendUrl = 'ws://127.0.0.1:19999' + url;
  console.log('[PXY] client connect ->', backendUrl);
  const backend = new NWS(backendUrl);
  backend.binaryType = 'arraybuffer';

  backend.onmessage = (e) => {
    const buf = Buffer.from(e.data instanceof ArrayBuffer ? e.data : e.data);
    console.log('[PXY] back->fw', buf.toString().slice(0,60));
    if (clientWs.readyState === 1) clientWs.send(buf);
  };
  backend.onopen = () => console.log('[PXY] backend OPEN');
  backend.onclose = () => { console.log('[PXY] backend CLOSE'); if (clientWs.readyState === 1) clientWs.close(); };
  backend.onerror = (e) => console.error('[PXY] backend ERR');

  clientWs.on('message', (data) => {
    console.log('[PXY] client->fw', data.toString().slice(0,60));
    if (backend.readyState === NWS.OPEN) backend.send(Buffer.from(data));
  });
  clientWs.on('close', () => { console.log('[PXY] client CLOSE'); backend.close(); });
  clientWs.on('error', (e) => console.error('[PXY] client ERR'));
});

server.on('upgrade', (req, sock, head) => {
  if (req.url && req.url.startsWith('/')) {
    wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws, req));
  } else { sock.destroy(); }
});

server.listen(3003, () => console.log('[PXY] Listening on :3003 -> :19999'));
server.on('error', (e) => console.error('[PXY] ERROR:', e.message));