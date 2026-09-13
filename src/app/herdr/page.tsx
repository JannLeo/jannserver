'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

interface HerdrSnapshot {
  version: string | null;
  agents: any[];
  panes: any[];
  tabs: any[];
  workspaces: any[];
  error?: string;
}

interface Session {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'blocked' | 'done' | 'error';
  agentType: string;
  pid?: string;
  socketPath?: string;
  logs?: string;
  createdAt: string;
  updatedAt: string;
}

const SUPPORTED_AGENTS = [
  { name: 'Claude Code', color: 'from-amber-500 to-orange-500', icon: '🤖' },
  { name: 'Codex', color: 'from-blue-500 to-cyan-500', icon: '⚡' },
  { name: 'Continue', color: 'from-purple-500 to-pink-500', icon: '🔗' },
  { name: 'Aider', color: 'from-green-500 to-emerald-500', icon: '🟢' },
  { name: 'Roo Code', color: 'from-violet-500 to-indigo-500', icon: '💜' },
];

const WORKFLOW_EXAMPLES = [
  { title: '并行代码审查', desc: '一个 agent 写代码，另一个 agent 同步审查，实时看到对方输出', color: 'from-cyan-500/20 to-blue-500/20' },
  { title: '长任务分离', desc: '跑一个 30 分钟的测试，分离后随时 SSH 重连看进度', color: 'from-purple-500/20 to-pink-500/20' },
  { title: '复杂工作流', desc: 'agent 之间通过 socket 互等：写完代码→通知审查→等待确认→合并', color: 'from-green-500/20 to-emerald-500/20' },
];

export default function HerdrPage() {
  const [data, setData] = useState<HerdrSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'workflows' | 'agents' | 'sessions'>('status');

  // ── Session management state ─────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAgent, setNewAgent] = useState('claude');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState('');

  const fetchSnapshot = useCallback(async () => {
    const res = await fetch('/api/herdr/snapshot');
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setSessions(d);
      setSessionError('');
    } catch (e: any) {
      setSessionError('无法加载会话 — 请确认 API 服务正常');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSnapshot(); }, [fetchSnapshot]);
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSnapshot();
    setRefreshing(false);
  };

  const createSession = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, agentType: newAgent }),
      });
      if (res.ok) {
        setNewName('');
        setShowNewForm(false);
        fetchSessions();
      }
    } catch {}
  };

  const deleteSession = async (id: string) => {
    try {
      await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      fetchSessions();
    } catch {}
  };

  const agentStatus = (name: string) => {
    const agent = data?.agents?.find((a: any) => a.agent === name || a.name === name);
    if (!agent) return { status: 'idle', label: '未启动' };
    return { status: agent.status, label: agent.status };
  };

  const statusColors: Record<string, string> = {
    idle: 'bg-stone-100 text-stone-500',
    running: 'bg-emerald-100 text-emerald-700',
    blocked: 'bg-amber-100 text-amber-700',
    done: 'bg-blue-100 text-blue-700',
    error: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<string, string> = {
    idle: '空闲',
    running: '运行中',
    blocked: '阻塞',
    done: '已完成',
    error: '错误',
  };

  const sessionCardStyle = (status: string) => ({
    border: status === 'running' ? 'border-blue-300' : status === 'error' ? 'border-red-300' : status === 'blocked' ? 'border-amber-300' : 'border-stone-200',
  });

  return (
    <div className="page-shell">
      <NavBar title="🔗 herdr & 会话管理" />
      <main className="max-w-3xl mx-auto p-4 space-y-4">

        {/* Server Status Banner */}
        <div className="app-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${data?.version ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-sm font-bold text-stone-800">
                  herdr Server {data?.version || (data?.error ? '连接失败' : '加载中...')}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                {data?.version
                  ? `· ${data?.agents?.length || 0} agents · ${data?.panes?.length || 0} panes · ${data?.tabs?.length || 0} tabs`
                  : data?.error || '连接中...'}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-500 font-bold disabled:opacity-50"
            >
              {refreshing ? '...' : '🔄'} 刷新
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
          {(['status', 'workflows', 'agents', 'sessions'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === tab ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
              }`}>
              {tab === 'status' ? '📊 状态' : tab === 'workflows' ? '🚀 工作流' : tab === 'agents' ? '🤖 Agents' : '📋 会话'}
            </button>
          ))}
        </div>

        {/* ── Status Tab ────────────────────────────────────────────── */}
        {activeTab === 'status' && (
          <div className="space-y-3">
            <div className="app-card divide-y divide-stone-100">
              {[['Agents', data?.agents?.length || 0], ['Panes', data?.panes?.length || 0], ['Tabs', data?.tabs?.length || 0], ['Workspaces', data?.workspaces?.length || 0]].map(([label, val]) => (
                <div key={label} className="p-3 flex items-center justify-between">
                  <span className="text-xs text-stone-500">{label}</span>
                  <span className="text-sm font-bold text-stone-700">{val}</span>
                </div>
              ))}
            </div>
            {data?.agents?.length === 0 && (
              <div className="app-card p-4 text-center">
                <p className="text-sm text-stone-500">还没有 agent 在运行</p>
                <p className="text-xs text-stone-400 mt-1">去终端运行 <code className="bg-stone-100 px-1 rounded">herdr</code> 启动</p>
              </div>
            )}
          </div>
        )}

        {/* ── Workflows Tab ──────────────────────────────────────────── */}
        {activeTab === 'workflows' && (
          <div className="space-y-3">
            {WORKFLOW_EXAMPLES.map((w, i) => (
              <div key={i} className={`app-card p-4 rounded-2xl bg-gradient-to-br ${w.color} border border-white/40`}>
                <h3 className="text-sm font-bold text-stone-800">{w.title}</h3>
                <p className="text-xs text-stone-600 mt-1">{w.desc}</p>
              </div>
            ))}
            <div className="app-card p-4 rounded-2xl border border-dashed border-stone-300 text-center">
              <p className="text-xs text-stone-400">在终端运行 <code className="bg-stone-100 px-1 rounded text-stone-600">herdr</code> 开始你的第一个工作流</p>
            </div>
          </div>
        )}

        {/* ── Agents Tab ─────────────────────────────────────────────── */}
        {activeTab === 'agents' && (
          <div className="space-y-3">
            <div className="app-card p-4">
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">支持的 Agents</h3>
              <div className="space-y-2">
                {SUPPORTED_AGENTS.map(agent => {
                  const { status, label } = agentStatus(agent.name);
                  return (
                    <div key={agent.name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-stone-50">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center text-sm`}>
                        {agent.icon}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-stone-800">{agent.name}</div>
                        <div className="text-xs text-stone-400">状态: <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusColors[status] || 'bg-stone-100 text-stone-500'}`}>{label}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="app-card p-4 rounded-2xl bg-stone-50 border border-stone-200">
              <h4 className="text-xs font-bold text-stone-600 mb-2">启动 Agent</h4>
              <div className="space-y-1.5 text-xs font-mono">
                {['herdr agent add claude --name "代码审查"', 'herdr agent add claude --name "bug修复"'].map(cmd => (
                  <div key={cmd} className="flex items-center gap-2">
                    <span className="text-stone-400">$</span>
                    <span className="text-stone-700 truncate">{cmd}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Sessions Tab (from agent-mux) ─────────────────────────── */}
        {activeTab === 'sessions' && (
          <div className="space-y-3">
            {sessionError && (
              <div className="app-card p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-600">{sessionError}</p>
              </div>
            )}

            {/* 新建表单 */}
            {showNewForm && (
              <div className="app-card p-4 space-y-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">会话名称</label>
                    <input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="例如: 代码审查 agent"
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      onKeyDown={e => e.key === 'Enter' && createSession()}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 mb-1">类型</label>
                    <select value={newAgent} onChange={e => setNewAgent(e.target.value)}
                      className="px-3 py-2 border border-stone-200 rounded-xl text-sm bg-white">
                      <option value="claude">Claude</option>
                      <option value="codex">Codex</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                  <button onClick={createSession} className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold">创建</button>
                  <button onClick={() => setShowNewForm(false)} className="px-3 py-2 text-stone-400 text-sm">取消</button>
                </div>
              </div>
            )}

            {/* 新建按钮 */}
            <button onClick={() => setShowNewForm(true)}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-stone-300 text-xs font-bold text-stone-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
              + 新建会话
            </button>

            {/* 会话列表 */}
            {sessionsLoading ? (
              <div className="app-card p-8 text-center text-sm text-stone-400">加载中...</div>
            ) : sessions.length === 0 ? (
              <div className="app-card p-8 text-center">
                <div className="text-3xl mb-2">📋</div>
                <p className="text-sm text-stone-500">暂无会话</p>
                <p className="text-xs text-stone-400 mt-1">点击上方「+ 新建会话」开始</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map(session => (
                  <div key={session.id}
                    className="app-card p-3 rounded-xl"
                    style={sessionCardStyle(session.status)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[session.status]?.replace('bg-', 'bg-').replace('text-', '')} ${session.status === 'running' ? 'bg-emerald-500 animate-pulse' : session.status === 'error' ? 'bg-red-500' : session.status === 'blocked' ? 'bg-amber-500' : 'bg-stone-300'}`} />
                        <span className="text-sm font-semibold text-stone-800">{session.name}</span>
                        <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{session.agentType}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-stone-400">
                          {new Date(session.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                          className="text-stone-400 hover:text-stone-600 text-xs">
                          {expandedId === session.id ? '▲' : '▼'}
                        </button>
                        {session.id !== 'sample' && (
                          <button onClick={() => deleteSession(session.id)}
                            className="text-red-300 hover:text-red-500 text-xs font-bold">✕</button>
                        )}
                      </div>
                    </div>
                    {expandedId === session.id && (
                      <div className="mt-2">
                        {session.pid && <p className="text-[10px] text-stone-400 mb-1">PID: {session.pid}</p>}
                        {session.logs ? (
                          <pre className="bg-stone-900 text-emerald-400 text-[10px] p-2 rounded-lg overflow-x-auto max-h-32">{session.logs}</pre>
                        ) : (
                          <p className="text-[10px] text-stone-400 italic">暂无日志</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="app-card p-4 space-y-2">
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider">常用命令</h3>
          {[
            { cmd: 'herdr', desc: '启动或重连默认会话' },
            { cmd: 'herdr status server', desc: '查看服务器状态' },
            { cmd: 'herdr server stop', desc: '停止服务器' },
            { cmd: 'herdr pane split', desc: '创建分屏' },
            { cmd: 'herdr session list', desc: '列出所有会话' },
          ].map(({ cmd, desc }) => (
            <div key={cmd} className="flex items-center gap-2 text-xs">
              <code className="flex-1 bg-stone-100 text-stone-700 px-2 py-1 rounded font-mono truncate">{cmd}</code>
              <span className="text-stone-400 flex-shrink-0">{desc}</span>
            </div>
          ))}
        </div>

        <Link
          href="/tailssh"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-bold shadow-lg transition-all hover:scale-[1.02]"
        >
          <span>🚀</span>
          在 Terminal 中启动 herdr
        </Link>

        <p className="text-center text-[10px] text-stone-400">
          herdr v{data?.version || '?'} · Socket: ~/.config/herdr/herdr.sock · PM2 管理
        </p>
      </main>
    </div>
  );
}