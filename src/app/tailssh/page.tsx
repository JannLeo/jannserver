'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import NavBar from '@/components/NavBar';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Host {
  id: string;
  name: string;
  tailscale_ip: string;
  user: string;
  port: number;
  key_file: string;
  auto_cmd: string;
  reconnect: boolean;
  reconnect_interval: number;
  enabled: boolean;
  connected: boolean;
}

interface TerminalRef {
  term: any;
  fitAddon: any;
}

// ─── Component ──────────────────────────────────────────────────────────────────
export default function TailSSHPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [currentHost, setCurrentHost] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connected' | 'connecting'>('disconnected');
  const terminalRef = useRef<TerminalRef | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hostListRef = useRef<HTMLDivElement>(null);

  // ── Backend URL ──
  const backendPort = 9222;
  const backendHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const baseUrl = `http://${backendHost}:${backendPort}`;
  const wsBase = `ws://${backendHost}:${backendPort}`;

  // ── Load xterm.js dynamically ──
  useEffect(() => {
    // Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
    document.head.appendChild(link);

    // Load scripts
    let loaded = 0;
    const checkDone = () => {
      loaded++;
      if (loaded >= 2 && containerRef.current) {
        initTerminal();
      }
    };

    const script1 = document.createElement('script');
    script1.src = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js';
    script1.onload = checkDone;
    document.head.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js';
    script2.onload = checkDone;
    document.head.appendChild(script2);

    // Also make sure FitAddon is available after load
    const checkInterval = setInterval(() => {
      if (typeof (window as any).Terminal !== 'undefined' && typeof (window as any).FitAddon !== 'undefined') {
        clearInterval(checkInterval);
        if (containerRef.current && !terminalRef.current) {
          initTerminal();
        }
      }
    }, 100);

    return () => {
      clearInterval(checkInterval);
      document.head.removeChild(link);
      document.head.removeChild(script1);
      document.head.removeChild(script2);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // ── Initialize xterm ──
  const initTerminal = () => {
    if (!containerRef.current || terminalRef.current) return;

    const FitAddon = (window as any).FitAddon;
    const Terminal = (window as any).Terminal;

    if (!Terminal || !FitAddon) return;

    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Fira Code', 'Courier New', monospace",
      fontSize: 14,
      cursorBlink: true,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88,166,255,0.3)',
        black: '#0d1117',
        brightBlack: '#8b949e',
        white: '#c9d1d9',
        brightWhite: '#ffffff',
        red: '#f85149',
        brightRed: '#ff7b72',
        green: '#3fb950',
        brightGreen: '#56d364',
        yellow: '#d29922',
        brightYellow: '#e3b341',
        blue: '#58a6ff',
        brightBlue: '#79c0ff',
        magenta: '#d2a8ff',
        brightMagenta: '#d2a8ff',
        cyan: '#39c5cf',
        brightCyan: '#56d4dd',
      },
      scrollback: 5000,
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    // Handle keyboard input
    term.onData((data: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stdin', data }));
      }
    });

    window.addEventListener('resize', () => {
      if (fitAddon) fitAddon.fit();
    });

    terminalRef.current = { term, fitAddon };
  };

  // ── Fetch hosts ──
  const refreshHosts = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/hosts`);
      const data = await res.json();
      setHosts(data);
    } catch (e) {
      console.error('Failed to fetch hosts:', e);
    }
  }, [baseUrl]);

  useEffect(() => {
    refreshHosts();
    const interval = setInterval(refreshHosts, 5000);
    return () => clearInterval(interval);
  }, [refreshHosts]);

  // ── Connect to host ──
  const connectHost = (hostId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setCurrentHost(hostId);
    setWsStatus('connecting');

    // Clear terminal
    const tr = terminalRef.current;
    if (tr) {
      tr.term.clear();
      tr.term.write(`\x1b[1;34m[TailSSH]\x1b[0m 连接中 \x1b[33m${hostId}\x1b[0m...\r\n`);
    }

    const ws = new WebSocket(`${wsBase}/ws/${hostId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
    };

    ws.onerror = () => {
      const tr = terminalRef.current;
      if (tr) tr.term.write('\r\n\x1b[31m[WebSocket 错误]\x1b[0m\r\n');
    };

    ws.onmessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data);
      const tr = terminalRef.current;
      if (!tr) return;

      if (msg.type === 'output') {
        tr.term.write(msg.data);
      } else if (msg.type === 'status') {
        const status = msg.status;
        if (status === 'connected') {
          tr.term.write('\r\n\x1b[32m[已连接]\x1b[0m\r\n');
        } else if (status === 'disconnected') {
          tr.term.write('\r\n\x1b[31m[连接已断开]\x1b[0m\r\n');
        } else if (status.startsWith('reconnecting')) {
          tr.term.write(`\r\n\x1b[33m[${status}]\x1b[0m\r\n`);
        } else if (status.startsWith('error')) {
          tr.term.write(`\r\n\x1b[31m[${status}]\x1b[0m\r\n`);
        }
      }
    };
  };

  // ── Reconnect host ──
  const reconnectHost = async (hostId: string) => {
    await fetch(`${baseUrl}/api/hosts/${hostId}/reconnect`, { method: 'POST' });
    if (currentHost === hostId) {
      connectHost(hostId);
    }
  };

  // ── Delete host ──
  const deleteHost = async (hostId: string) => {
    if (!confirm(`确认删除主机 ${hostId}？`)) return;
    await fetch(`${baseUrl}/api/hosts/${hostId}`, { method: 'DELETE' });
    if (currentHost === hostId) {
      setCurrentHost(null);
      const tr = terminalRef.current;
      if (tr) {
        tr.term.clear();
        tr.term.write('选择一台主机');
      }
    }
    refreshHosts();
  };

  const activeHost = hosts.find(h => h.id === currentHost);

  return (
    <div className="flex h-full flex-col">
      <NavBar title="SSH 终端" />

      <div className="flex flex-1 overflow-hidden bg-zinc-950">
        {/* Sidebar: Host list */}
        <div
          ref={hostListRef}
          className="flex w-64 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-900"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-300">主机列表</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {hosts.length === 0 ? (
              <div className="mt-8 text-center text-xs text-zinc-500">
                暂无主机，请先在 Python 后端的 config.json 中配置
              </div>
            ) : (
              hosts.map(host => (
                <div
                  key={host.id}
                  onClick={() => connectHost(host.id)}
                  className={`group mb-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                    currentHost === host.id
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${
                      host.connected
                        ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                        : 'bg-zinc-600'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{host.name}</div>
                    <div className="truncate text-xs text-zinc-500">{host.tailscale_ip}:{host.port}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={e => { e.stopPropagation(); reconnectHost(host.id); }}
                      className="rounded border border-zinc-600 px-1.5 py-0.5 text-xs text-zinc-400 hover:border-yellow-600 hover:text-yellow-500"
                    >
                      ⟳
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteHost(host.id); }}
                      className="rounded border border-zinc-600 px-1.5 py-0.5 text-xs text-zinc-400 hover:border-red-600 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main: Terminal */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Connection status bar */}
          <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
            <span className="flex-1 text-sm font-semibold text-zinc-300">
              {activeHost
                ? `${activeHost.name} · ${activeHost.tailscale_ip}`
                : '选择一台主机'}
            </span>
            <span
              className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${
                wsStatus === 'connected'
                  ? 'border-green-600 bg-green-900/30 text-green-400'
                  : wsStatus === 'connecting'
                  ? 'border-yellow-600 bg-yellow-900/30 text-yellow-400'
                  : 'border-zinc-600 bg-zinc-800 text-zinc-500'
              }`}
            >
              {wsStatus === 'connected' ? '已连接' : wsStatus === 'connecting' ? '连接中' : '未连接'}
            </span>
          </div>

          {/* Terminal */}
          <div ref={containerRef} className="flex-1 overflow-hidden bg-black p-1" />
        </div>
      </div>
    </div>
  );
}