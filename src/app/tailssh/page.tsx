'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import NavBar from '@/components/NavBar';

interface Host {
  id: string; name: string; tailscale_ip: string; user: string;
  port: number; key_file: string; auto_cmd: string; reconnect: boolean;
  reconnect_interval: number; enabled: boolean; connected: boolean;
}

const baseUrl = '/api/tailssh';
const getWsUrl = (hostId: string) => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + window.location.host + '/ws/' + hostId;
};

// ─── Edit Host Modal ──────────────────────────────────────────────────────────
function EditHostModal({ host, onClose, onSaved }: { host: Host; onClose: () => void; onSaved: () => void }) {
  const [autoCmd, setAutoCmd] = useState(host.auto_cmd || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(baseUrl + '/api/hosts/' + host.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...host, auto_cmd: autoCmd }),
      });
      if (!res.ok) { setError('保存失败'); setLoading(false); return; }
      onSaved(); onClose();
    } catch { setError('网络错误'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-200">编辑主机 — {host.name}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl">×</button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">连接后自动执行的命令</label>
            <input
              value={autoCmd}
              onChange={e => setAutoCmd(e.target.value)}
              placeholder="例如: cd /home && ls -la"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-teal-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">连接建立后自动执行，输完后按回车</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={loading}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
            {loading ? '保存中...' : '保存'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Single TerminalPane ──────────────────────────────────────────────────────
function TerminalPane({ host, onHostUpdated }: { host: Host; onHostUpdated: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<string>('待连接');
  const [statusColor, setStatusColor] = useState<string>('border-zinc-600 bg-zinc-800 text-zinc-500');
  const [isConn, setIsConn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [localHost, setLocalHost] = useState(host);

  const log = useCallback((msg: string) => { if (termRef.current) termRef.current.write(msg); }, []);
  const wipeAndLog = useCallback((msg: string) => {
    if (termRef.current) termRef.current.clear();
    log(msg);
  }, [log]);

  // Load xterm from CDN
  useEffect(() => {
    let cssLoaded = !!document.getElementById('xterm-css');

    if (!cssLoaded) {
      const link = document.createElement('link');
      link.id = 'xterm-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
      document.head.appendChild(link);
    }

    const loadXterm = () => {
      const Terminal = (window as any).Terminal;
      const FitAddon = (window as any).FitAddon;
      if (!Terminal || !FitAddon || !containerRef.current) return;
      if (termRef.current) return;

      try {
        const term = new Terminal({
          fontFamily: "'Cascadia Code', 'Fira Code', 'Courier New', monospace",
          fontSize: 13, cursorBlink: true,
          theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', selectionBackground: 'rgba(88,166,255,0.3)' },
          scrollback: 5000,
        });
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);
        fitAddon.fit();

        const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch {} });
        ro.observe(containerRef.current);

        term.onData((data: string) => {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stdin', data }));
        });

        termRef.current = term;
        fitRef.current = fitAddon;
        console.log('[TailSSH] xterm OK, container:', containerRef.current.clientWidth + 'x' + containerRef.current.clientHeight);
        // Automatically connect when terminal is ready
        term.write('\x1b[1;34m[TailSSH]\x1b[0m Initiating connection...\r\n');
        connect();
      } catch (err) {
        console.error('[TailSSH] xterm init failed:', err);
      }
    };

    if ((window as any).Terminal) {
      const s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js';
      s2.onload = loadXterm;
      document.head.appendChild(s2);
    } else {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js';
      s.onload = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js';
        s2.onload = loadXterm;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (termRef.current) termRef.current.focus();
    wipeAndLog('\r\n\x1b[1;34m[TailSSH]\x1b[0m connecting \x1b[33m' + localHost.name + '\x1b[0m...\r\n');
    setStatus('连接中');
    setStatusColor('border-yellow-600 bg-yellow-900/30 text-yellow-400');
    setIsConn(false);

    const wsUrl = getWsUrl(localHost.id);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const timer = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        wipeAndLog('\r\n\x1b[31m[Connection timeout]\x1b[0m\r\n');
        setStatus('超时'); setStatusColor('border-red-600 bg-red-900/30 text-red-400');
        ws.close();
      }
    }, 20000);

    ws.onopen = () => {
      clearTimeout(timer);
      wipeAndLog('\r\n\x1b[32m[WS Connected]\x1b[0m\r\n');
      setStatus('已连接'); setStatusColor('border-green-600 bg-green-900/30 text-green-400');
      setIsConn(true);
      if (termRef.current) termRef.current.focus();

      // Keepalive ping every 25s to prevent Cloudflare/proxy idle timeout
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 25000);
    };
    ws.onclose = (e) => {
      clearTimeout(timer);
      clearInterval(pingTimer);
      if (!e.wasClean) wipeAndLog('\r\n\x1b[31m[Closed ' + e.code + ']\x1b[0m\r\n');
      setStatus('未连接'); setStatusColor('border-zinc-600 bg-zinc-800 text-zinc-500');
      setIsConn(false);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      wipeAndLog('\r\n\x1b[31m[WS Error]\x1b[0m\r\n');
      setStatus('错误'); setStatusColor('border-red-600 bg-red-900/30 text-red-400');
      setIsConn(false);
    };
    ws.onmessage = (e: MessageEvent) => {
      if (wsRef.current !== ws) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'output') log(msg.data);
        else if (msg.type === 'status') {
          if (msg.status === 'connected') log('\r\n\x1b[32m[SSH Connected]\x1b[0m\r\n');
          else if (msg.status === 'disconnected') log('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n');
          else log('\r\n\x1b[33m[' + msg.status + ']\x1b[0m\r\n');
        }
      } catch {}
    };
  }, [localHost.id, localHost.name, wipeAndLog, log]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
        <span className={'h-2 w-2 flex-shrink-0 rounded-full ' + (localHost.connected ? 'bg-green-500' : 'bg-zinc-600')} />
        <span className="flex-1 truncate text-sm font-semibold text-zinc-300">
          {localHost.name}
          <span className="ml-2 text-xs text-zinc-500">{localHost.tailscale_ip}</span>
        </span>
        <span className={'rounded-full border px-2 py-0.5 text-xs font-semibold ' + statusColor}>{status}</span>
        <button onClick={() => setEditing(true)} className="flex-shrink-0 rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300">编辑</button>
        <button onClick={connect} className="flex-shrink-0 rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-600">
          {isConn ? '重连' : '连接'}
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-black"
        style={{ minHeight: 0 }}
        tabIndex={0}
      />
      {editing && (
        <EditHostModal
          host={localHost}
          onClose={() => setEditing(false)}
          onSaved={() => { setLocalHost({ ...localHost }); onHostUpdated(); setEditing(false); }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TailSSHPage() {
  const [hosts, setHosts] = useState<Host[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(baseUrl + '/api/hosts');
      if (!res.ok) return;
      setHosts(await res.json());
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const it = setInterval(refresh, 15000); return () => clearInterval(it); }, [refresh]);

  const paneHosts = hosts.filter(h => h.enabled).slice(0, 3);

  return (
    <div className="flex flex-col bg-zinc-950 overflow-hidden" style={{ height: '100vh' }}>
      <NavBar title="SSH Terminal" />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {paneHosts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">Loading hosts...</div>
        ) : paneHosts.length === 1 ? (
          <TerminalPane key={paneHosts[0].id} host={paneHosts[0]} onHostUpdated={refresh} />
        ) : (
          <div className="flex w-full flex-col overflow-hidden sm:flex-row">
            {paneHosts.map((h, i) => (
              <div key={h.id} className={'flex flex-1 min-h-0 flex-col overflow-hidden ' + (i < paneHosts.length - 1 ? 'border-b border-zinc-800 sm:border-b-0 sm:border-r' : '')}>
                <TerminalPane host={h} onHostUpdated={refresh} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
