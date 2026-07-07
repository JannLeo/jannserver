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

interface NewHostForm {
  name: string;
  tailscale_ip: string;
  user: string;
  port: string;
  key_file: string;
  auto_cmd: string;
}

// ─── Component ──────────────────────────────────────────────────────────────────
export default function TailSSHPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [currentHost, setCurrentHost] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connected' | 'connecting'>('disconnected');
  const terminalRef = useRef<TerminalRef | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // ── Backend URL ──
  const backendPort = 9222;
  const backendHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const baseUrl = `http://${backendHost}:${backendPort}`;
  const wsBase = `ws://${backendHost}:${backendPort}`;

  // ── Load xterm.js dynamically ──
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
    document.head.appendChild(link);

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
      try { document.head.removeChild(script1); } catch {}
      try { document.head.removeChild(script2); } catch {}
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

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
      },
      scrollback: 5000,
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

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
    term.write('选择一台主机开始连接\r\n');
  };

  // ── Fetch hosts ──
  const refreshHosts = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/hosts`);
      if (!res.ok) return;
      const data = await res.json();
      setHosts(data);
    } catch (e) {
      // backend not reachable
    }
  }, [baseUrl]);

  useEffect(() => {
    refreshHosts();
    const interval = setInterval(refreshHosts, 5000);
    return () => clearInterval(interval);
  }, [refreshHosts]);

  // ── Connect ──
  const connectHost = (hostId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setCurrentHost(hostId);
    setWsStatus('connecting');

    const tr = terminalRef.current;
    if (tr) {
      tr.term.clear();
      tr.term.write(`\x1b[1;34m[TailSSH]\x1b[0m 连接中 \x1b[33m${hostId}\x1b[0m...\r\n`);
    }

    const ws = new WebSocket(`${wsBase}/ws/${hostId}`);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus('connected');
    ws.onclose = () => setWsStatus('disconnected');
    ws.onerror = () => {
      if (tr) tr.term.write('\r\n\x1b[31m[WebSocket 错误]\x1b[0m\r\n');
    };

    ws.onmessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data);
      const tr = terminalRef.current;
      if (!tr) return;

      if (msg.type === 'output') {
        tr.term.write(msg.data);
      } else if (msg.type === 'status') {
        const s = msg.status;
        if (s === 'connected') {
          tr.term.write('\r\n\x1b[32m[已连接]\x1b[0m\r\n');
        } else if (s === 'disconnected') {
          tr.term.write('\r\n\x1b[31m[连接已断开]\x1b[0m\r\n');
        } else if (s.startsWith('reconnecting')) {
          tr.term.write(`\r\n\x1b[33m[${s}]\x1b[0m\r\n`);
        } else if (s.startsWith('error') || s.startsWith('failed')) {
          tr.term.write(`\r\n\x1b[31m[${s}]\x1b[0m\r\n`);
        }
        refreshHosts();
      }
    };
  };

  // ── Delete host ──
  const deleteHost = async (hostId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确认删除 ${hostId}？`)) return;
    await fetch(`${baseUrl}/api/hosts/${hostId}`, { method: 'DELETE' });
    if (currentHost === hostId) {
      setCurrentHost(null);
      const tr = terminalRef.current;
      if (tr) { tr.term.clear(); tr.term.write('选择一台主机\r\n'); }
    }
    refreshHosts();
  };

  // ── Add host ──
  const [newHost, setNewHost] = useState<NewHostForm>({
    name: '',
    tailscale_ip: '',
    user: '',
    port: '22',
    key_file: '~/.ssh/id_ed25519',
    auto_cmd: '',
  });

  const submitAddHost = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    const payload = {
      name: newHost.name,
      tailscale_ip: newHost.tailscale_ip,
      user: newHost.user,
      port: parseInt(newHost.port) || 22,
      key_file: newHost.key_file,
      auto_cmd: newHost.auto_cmd,
      reconnect: true,
      reconnect_interval: 10,
      enabled: true,
    };

    try {
      const res = await fetch(`${baseUrl}/api/hosts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '添加失败' }));
        setAddError(err.error || '添加失败');
        setAddLoading(false);
        return;
      }
      setShowAddModal(false);
      setNewHost({ name: '', tailscale_ip: '', user: '', port: '22', key_file: '~/.ssh/id_ed25519', auto_cmd: '' });
      refreshHosts();
    } catch {
      setAddError('网络错误');
    }
    setAddLoading(false);
  };

  const activeHost = hosts.find(h => h.id === currentHost);

  return (
    <div className="flex h-full flex-col">
      <NavBar title="SSH 终端" />

      <div className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
        {/* Host list strip - horizontal row at top */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
          <span className="flex-shrink-0 text-sm font-bold text-zinc-300">主机列表</span>
          <div className="flex flex-1 items-center gap-2 overflow-x-auto py-1">
            {hosts.length === 0 ? (
              <span className="text-xs text-zinc-500">暂无主机</span>
            ) : (
              hosts.map(host => (
                <div
                  key={host.id}
                  onClick={() => connectHost(host.id)}
                  className={`group flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition ${
                    currentHost === host.id
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${host.connected ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-zinc-600'}`} />
                  <span className="text-sm font-semibold whitespace-nowrap">{host.name}</span>
                  <span className="text-xs text-zinc-500 whitespace-nowrap">{host.tailscale_ip}:{host.port}</span>
                  <button
                    onClick={(e) => deleteHost(host.id, e)}
                    className="ml-1 flex-shrink-0 rounded px-1 text-xs text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-600"
          >
            + 添加
          </button>
        </div>

        {/* Terminal area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
            <span className="flex-1 text-sm font-semibold text-zinc-300">
              {activeHost ? `${activeHost.name} · ${activeHost.tailscale_ip}` : '选择一台主机'}
            </span>
            <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${
              wsStatus === 'connected' ? 'border-green-600 bg-green-900/30 text-green-400'
                : wsStatus === 'connecting' ? 'border-yellow-600 bg-yellow-900/30 text-yellow-400'
                : 'border-zinc-600 bg-zinc-800 text-zinc-500'
            }`}>
              {wsStatus === 'connected' ? '已连接' : wsStatus === 'connecting' ? '连接中' : '未连接'}
            </span>
          </div>
          <div ref={containerRef} className="flex-1 overflow-hidden bg-black p-1" />
        </div>
      </div>

      {/* Add Host Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-96 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-200">添加主机</h3>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            <form onSubmit={submitAddHost} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">名称</label>
                <input required value={newHost.name} onChange={e => setNewHost({...newHost, name: e.target.value})} placeholder="sz服务器" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Tailscale IP</label>
                <input required value={newHost.tailscale_ip} onChange={e => setNewHost({...newHost, tailscale_ip: e.target.value})} placeholder="100.112.35.71" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-400">用户</label>
                  <input required value={newHost.user} onChange={e => setNewHost({...newHost, user: e.target.value})} placeholder="sz" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500" />
                </div>
                <div className="w-24">
                  <label className="mb-1 block text-xs text-zinc-400">端口</label>
                  <input required value={newHost.port} onChange={e => setNewHost({...newHost, port: e.target.value})} placeholder="22" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">SSH 密钥路径</label>
                <input required value={newHost.key_file} onChange={e => setNewHost({...newHost, key_file: e.target.value})} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">连接后执行命令（可选）</label>
                <input value={newHost.auto_cmd} onChange={e => setNewHost({...newHost, auto_cmd: e.target.value})} placeholder="tmux" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500" />
              </div>
              {addError && <div className="text-xs text-red-400">{addError}</div>}
              <button type="submit" disabled={addLoading} className="mt-1 rounded-lg bg-zinc-700 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-600 disabled:opacity-50">
                {addLoading ? '添加中...' : '添加'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}