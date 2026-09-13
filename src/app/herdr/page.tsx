'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import NavBar from '@/components/NavBar';

interface Agent {
  terminal_id: string;
  pane_id: string;
  tab_id: string;
  agent: string | null;
  display_agent: string | null;
  agent_status: string;
  name: string | null;
  title: string | null;
  cwd: string | null;
  focused: boolean;
}

const AGENT_TYPES = [
  { label: 'Claude Code', value: 'claude', defaultArgv: 'claude' },
  { label: 'Bash', value: 'bash', defaultArgv: '/bin/bash' },
  { label: 'Node REPL', value: 'node', defaultArgv: 'node' },
  { label: 'Python REPL', value: 'python', defaultArgv: 'python3' },
  { label: 'Custom', value: 'custom', defaultArgv: '' },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    idle: 'bg-slate-100 text-slate-600 border-slate-200',
    working: 'bg-amber-50 text-amber-700 border-amber-200',
    blocked: 'bg-red-50 text-red-600 border-red-200',
    done: 'bg-green-50 text-green-700 border-green-200',
    unknown: 'bg-slate-100 text-slate-400 border-slate-200',
  };
  const cls = map[status] ?? map.unknown;
  const label: Record<string, string> = {
    idle: '空闲', working: '运行中', blocked: '阻塞', done: '已完成', unknown: '未知'
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {label[status] ?? status}
    </span>
  );
}

export default function HerdrPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Start form
  const [formType, setFormType] = useState('claude');
  const [formArgv, setFormArgv] = useState('claude');
  const [formName, setFormName] = useState('');
  const [formCwd, setFormCwd] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Output panels: agentId -> { open, lines }
  const [outputPanels, setOutputPanels] = useState<Record<string, { open: boolean; lines: string[] }>>({});
  const [sendText, setSendText] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});

  const outputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const esRefs = useRef<Record<string, EventSource | null>>({});

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/herdr/agent/status');
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setAgents(data.result ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? '获取列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const id = setInterval(fetchAgents, 5000);
    return () => clearInterval(id);
  }, [fetchAgents]);

  // Auto-scroll output panels
  useEffect(() => {
    Object.values(outputRefs.current).forEach(el => {
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [outputPanels]);

  const handleTypeChange = (t: string) => {
    setFormType(t);
    const preset = AGENT_TYPES.find(a => a.value === t);
    setFormArgv(preset?.defaultArgv ?? '');
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formArgv.trim()) return;
    setStarting(true);
    setStartError(null);
    try {
      const argvArr = formArgv.trim().split(/\s+/);
      const res = await fetch('/api/herdr/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), argv: argvArr, cwd: formCwd.trim() || undefined }),
      });
      const data = await res.json();
      if (data.error) { setStartError(data.error); return; }
      setFormName('');
      setFormCwd('');
      fetchAgents();
    } catch (e: any) {
      setStartError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const openOutput = (agentId: string) => {
    if (outputPanels[agentId]?.open) {
      // Close
      esRefs.current[agentId]?.close();
      delete esRefs.current[agentId];
      setOutputPanels(prev => ({ ...prev, [agentId]: { ...prev[agentId], open: false } }));
      return;
    }

    // Open
    setOutputPanels(prev => ({ ...prev, [agentId]: { open: true, lines: [] } }));

    const es = new EventSource(`/api/herdr/agent/stream?agentId=${encodeURIComponent(agentId)}`);
    esRefs.current[agentId] = es;

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'output') {
          setOutputPanels(prev => {
            const existing = prev[agentId] ?? { open: true, lines: [] };
            return { ...prev, [agentId]: { ...existing, lines: [...existing.lines, msg.content] } };
          });
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      delete esRefs.current[agentId];
    };
  };

  const closeOutputPanel = (agentId: string) => {
    esRefs.current[agentId]?.close();
    delete esRefs.current[agentId];
    setOutputPanels(prev => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
  };

  const handleStop = async (agentId: string) => {
    try {
      await fetch('/api/herdr/agent/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      closeOutputPanel(agentId);
      fetchAgents();
    } catch (e: any) {
      console.error('stop error', e);
    }
  };

  const handleSend = async (agentId: string) => {
    const text = sendText[agentId] ?? '';
    if (!text.trim()) return;
    setSending(prev => ({ ...prev, [agentId]: true }));
    try {
      await fetch('/api/herdr/agent/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: agentId, text }),
      });
      // Preserve textarea content after send for easy editing/resend
    } catch (e: any) {
      console.error('send error', e);
    } finally {
      setSending(prev => ({ ...prev, [agentId]: false }));
    }
  };

  return (
    <div className="page-shell">
      <NavBar title="🤖 Herdr Agent 控制台" />

      <main className="max-w-4xl mx-auto p-6 space-y-6">

        {/* Start Agent Form */}
        <div className="app-card p-5">
          <h2 className="text-sm font-black text-stone-700 mb-4 tracking-[-0.02em]">启动新 Agent</h2>
          <form onSubmit={handleStart} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Agent 类型</label>
                <select
                  value={formType}
                  onChange={e => handleTypeChange(e.target.value)}
                  className="app-input w-full rounded-xl px-3 py-2 text-sm"
                >
                  {AGENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Agent 名称</label>
                <input
                  className="app-input w-full rounded-xl px-3 py-2 text-sm"
                  placeholder="my-agent"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">命令 / argv</label>
                <input
                  className="app-input w-full rounded-xl px-3 py-2 text-sm"
                  placeholder="claude, /bin/bash, ..."
                  value={formArgv}
                  onChange={e => setFormArgv(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">工作目录（可选）</label>
                <input
                  className="app-input w-full rounded-xl px-3 py-2 text-sm"
                  placeholder="/home/sz/..."
                  value={formCwd}
                  onChange={e => setFormCwd(e.target.value)}
                />
              </div>
            </div>
            {startError && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">{startError}</div>
            )}
            <button
              type="submit"
              disabled={starting}
              className="app-button-primary px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {starting ? '启动中...' : '🚀 启动 Agent'}
            </button>
          </form>
        </div>

        {/* Agent List */}
        <div className="app-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-stone-700 tracking-[-0.02em]">运行中的 Agent</h2>
            <button onClick={fetchAgents} className="text-xs text-stone-400 hover:text-teal-600 transition-colors">
              ↻ 刷新
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-stone-400 text-sm gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              加载中...
            </div>
          ) : error ? (
            <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              错误: {error}
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl mb-2">🤖</div>
              <p className="text-stone-400 font-medium text-sm">暂无运行中的 Agent</p>
              <p className="text-stone-300 text-xs mt-1">在上方表单启动一个 Agent</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map(agent => (
                <div key={agent.terminal_id} className="border border-stone-200/60 rounded-2xl overflow-hidden">
                  {/* Agent header row */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/50 hover:bg-amber-50/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-stone-800 truncate">
                          {agent.name ?? agent.title ?? agent.display_agent ?? agent.agent ?? '未知'}
                        </span>
                        <StatusBadge status={agent.agent_status} />
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        {agent.display_agent && (
                          <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono text-[10px]">
                            {agent.display_agent}
                          </span>
                        )}
                        <span>PID: <span className="font-mono">{agent.terminal_id.slice(0, 12)}...</span></span>
                        {agent.cwd && (
                          <span className="truncate max-w-[200px]" title={agent.cwd}>📁 {agent.cwd}</span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Send */}
                      <button
                        onClick={() => {
                          const text = sendText[agent.terminal_id] ?? '';
                          if (!text) return;
                          handleSend(agent.terminal_id);
                        }}
                        disabled={sending[agent.terminal_id]}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 transition-all"
                        title="发送消息"
                      >
                        {sending[agent.terminal_id] ? '...' : '✉️ 发送'}
                      </button>

                      {/* Output toggle */}
                      <button
                        onClick={() => openOutput(agent.terminal_id)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                          outputPanels[agent.terminal_id]?.open
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="实时输出"
                      >
                        📺 {outputPanels[agent.terminal_id]?.open ? '关闭输出' : '查看输出'}
                      </button>

                      {/* Stop */}
                      <button
                        onClick={() => handleStop(agent.terminal_id)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all"
                        title="停止 Agent"
                      >
                        ⏹ 停止
                      </button>
                    </div>
                  </div>

                  {/* Send input */}
                  <div className="px-4 pb-3 bg-white/30">
                    <div className="flex gap-2 mt-2">
                      <textarea
                        className="flex-1 app-input rounded-xl px-3 py-2 text-xs resize-none"
                        placeholder="向 Agent 发送消息..."
                        rows={2}
                        value={sendText[agent.terminal_id] ?? ''}
                        onChange={e => setSendText(prev => ({ ...prev, [agent.terminal_id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend(agent.terminal_id);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Output panel */}
                  {outputPanels[agent.terminal_id]?.open && (
                    <div className="border-t border-stone-200/60 bg-[#0d1117]">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-white/5">
                        <span className="text-xs text-stone-400 font-mono">stdout / stderr</span>
                        <button
                          onClick={() => closeOutputPanel(agent.terminal_id)}
                          className="text-stone-500 hover:text-white text-xs transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        ref={el => { outputRefs.current[agent.terminal_id] = el; }}
                        className="w-full bg-transparent text-green-400 text-xs font-mono p-3 resize-none focus:outline-none"
                        rows={10}
                        readOnly
                        value={outputPanels[agent.terminal_id]?.lines.join('') ?? ''}
                        placeholder="等待输出..."
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}