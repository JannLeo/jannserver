'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import NavBar from '@/components/NavBar';

// ─── Types ───────────────────────────────────────────────────────────────────
interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  market: string;
}

interface SignalResult {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  analysis: string;
  model: string;
  timestamp: string;
}

// ─── Tab definitions ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'chat',    label: '💬 智能对话',     icon: '💬' },
  { id: 'market',  label: '📊 市场数据',     icon: '📊' },
  { id: 'aitrader',label: '🤖 AI 交易信号',  icon: '🤖' },
  { id: 'agents',  label: '🧠 AI Agent 工作流', icon: '🧠' },
] as const;
type TabId = typeof TABS[number]['id'];

// ─── Agent templates ─────────────────────────────────────────────────────────
const AGENT_TEMPLATES = [
  { slug: 'earnings-reviewer', name: 'Earnings Reviewer', desc: '分析财报电话会议，提取关键财务指标和管理层语调变化', color: 'from-blue-500 to-blue-700', argv: ['claude', '--print', '分析最新财报数据和关键指标'] },
  { slug: 'market-researcher', name: 'Market Researcher', desc: '多源市场情报收集，分析行业趋势和竞争格局', color: 'from-green-500 to-green-700', argv: ['claude', '--print', '收集并分析当前市场行业趋势'] },
  { slug: 'valuation-reviewer', name: 'Valuation Reviewer', desc: '多维度估值分析（DCF/Comparable/DDM），发现定价偏差', color: 'from-amber-500 to-amber-700', argv: ['claude', '--print', '对指定股票进行估值分析'] },
  { slug: 'kyc-screener', name: 'KYC Screener', desc: '交易对手尽职调查，核查制裁名单和关联风险', color: 'from-red-500 to-red-700', argv: ['claude', '--print', '执行KYC尽职调查'] },
  { slug: 'pitch-agent', name: 'Pitch Agent', desc: '生成投资pitch deck，包含估值叙事和催化剂分析', color: 'from-purple-500 to-purple-700', argv: ['claude', '--print', '生成投资pitch deck'] },
  { slug: 'model-builder', name: 'Model Builder', desc: '构建和验证金融模型（预测/估值/风险），输出结构化报告', color: 'from-cyan-500 to-cyan-700', argv: ['claude', '--print', '构建金融预测模型'] },
  { slug: 'statement-auditor', name: 'Statement Auditor', desc: '审计财务报表，识别会计异常和潜在操纵信号', color: 'from-orange-500 to-orange-700', argv: ['claude', '--print', '审计财务报表'] },
  { slug: 'meeting-prep-agent', name: 'Meeting Prep Agent', desc: '生成分析师会议备忘卡片，追踪管理层历史表态', color: 'from-pink-500 to-pink-700', argv: ['claude', '--print', '准备分析师会议备忘'] },
  { slug: 'gl-reconciler', name: 'GL Reconciler', desc: '总账核对与调整，自动化账目匹配和问题追溯', color: 'from-teal-500 to-teal-700', argv: ['claude', '--print', '执行总账核对'] },
  { slug: 'month-end-closer', name: 'Month-End Closer', desc: '月末结账流程跟踪，提示未清项目和预警节点', color: 'from-indigo-500 to-indigo-700', argv: ['claude', '--print', '跟踪月末结账流程'] },
];

// ─── Market watch list ────────────────────────────────────────────────────────
const WATCH_LIST = [
  { symbol: 'AAPL',  name: '苹果',       market: 'US' },
  { symbol: 'MSFT',  name: '微软',       market: 'US' },
  { symbol: 'GOOGL', name: '谷歌',       market: 'US' },
  { symbol: 'NVDA',  name: '英伟达',     market: 'US' },
  { symbol: 'TSLA',  name: '特斯拉',     market: 'US' },
  { symbol: '600519', name: '贵州茅台',  market: 'A' },
  { symbol: '000858', name: '五粮液',    market: 'A' },
  { symbol: '601318', name: '中国平安',  market: 'A' },
  { symbol: '000001', name: '平安银行',  market: 'A' },
];

// ─── MarketTab (unchanged) ────────────────────────────────────────────────────
function MarketTab() {
  const [data, setData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('AAPL');
  const [inputSymbol, setInputSymbol] = useState('AAPL');
  const [error, setError] = useState('');

  const fetchStock = useCallback(async (symbol: string) => {
    try {
      const res = await fetch(`/api/v1/fincept/stock/${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const info = json.data?.info || json.info || {};
      const price = parseFloat(info.price || info.close || 0);
      const prev = parseFloat(info.pre_close || info.previousClose || price);
      const chg = price - prev;
      setData(prevState => ({
        ...prevState,
        [symbol]: {
          symbol, name: info.name || info.name_cn || symbol, price, change: chg,
          change_pct: price > 0 ? (chg / price) * 100 : 0,
          volume: parseInt(info.volume || 0), market: info.market || 'unknown',
        },
      }));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetch('/api/v1/fincept/stock/health').then(r => r.json()).then(() => {
      setLoading(true);
      Promise.all(WATCH_LIST.map(w => fetchStock(w.symbol))).finally(() => setLoading(false));
    }).catch(() => { setError('⚠️ Fincept API 未运行'); setLoading(false); });
  }, [fetchStock]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputSymbol.trim()) return;
    setQuery(inputSymbol.trim().toUpperCase());
    setLoading(true);
    fetchStock(inputSymbol.trim().toUpperCase()).finally(() => setLoading(false));
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {error ? (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm">{error}</div>
      ) : (
        <div className="bg-green-900/20 border border-green-700 rounded p-2 text-green-400 text-xs">✅ Fincept API 已连接</div>
      )}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input value={inputSymbol} onChange={e => setInputSymbol(e.target.value)} placeholder="输入股票代码，如 AAPL / 600519"
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none" />
        <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm">{loading ? '查询中…' : '查询'}</button>
      </form>
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">🇺🇸 美股</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {WATCH_LIST.filter(w => w.market === 'US').map(w => <MarketCard key={w.symbol} item={w} data={data[w.symbol]} />)}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">🇨🇳 A股</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {WATCH_LIST.filter(w => w.market === 'A').map(w => <MarketCard key={w.symbol} item={w} data={data[w.symbol]} />)}
        </div>
      </div>
    </div>
  );
}

function MarketCard({ item, data }: { item: typeof WATCH_LIST[0]; data?: MarketData }) {
  if (!data) return (
    <div className="bg-gray-800/50 rounded p-3 border border-gray-700">
      <div className="text-xs text-gray-400">{item.symbol}</div><div className="text-sm text-gray-500 mt-1">{item.name}</div><div className="text-xs text-gray-600 mt-1">加载中…</div>
    </div>
  );
  const up = data.change >= 0;
  return (
    <div className="bg-gray-800/50 rounded p-3 border border-gray-700 hover:border-gray-500 transition-colors">
      <div className="flex justify-between items-start">
        <div><div className="text-xs font-mono text-gray-300">{data.symbol}</div><div className="text-sm text-white mt-0.5">{data.name}</div></div>
        <div className={`text-xs font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>{up ? '+' : ''}{data.change.toFixed(2)}</div>
      </div>
      <div className="flex justify-between items-end mt-2">
        <div className="text-lg font-bold text-white">${data.price.toFixed(2)}</div>
        <div className={`text-xs ${up ? 'text-green-400' : 'text-red-400'}`}>{up ? '▲' : '▼'} {Math.abs(data.change_pct).toFixed(2)}%</div>
      </div>
    </div>
  );
}

// ─── AITraderTab (NEW: actual trading signal) ────────────────────────────────
function AITraderTab() {
  const [symbol, setSymbol] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SignalResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SignalResult[]>([]);

  const analyze = async () => {
    if (!symbol.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      // First fetch market data
      let marketData: any = {};
      try {
        const stockRes = await fetch(`/api/v1/fincept/stock/${encodeURIComponent(symbol.trim().toUpperCase())}`);
        if (stockRes.ok) {
          const stockJson = await stockRes.json();
          const info = stockJson.data?.info || stockJson.info || {};
          const price = parseFloat(info.price || info.close || 0);
          const prev = parseFloat(info.pre_close || info.previousClose || price);
          marketData = { price, change: price - prev, change_pct: price > 0 ? ((price - prev) / price) * 100 : 0, volume: parseInt(info.volume || 0), name: info.name || info.name_cn || symbol };
        }
      } catch { /* ignore stock fetch errors */ }

      // Then call AI signal API
      const res = await fetch('/api/stock/ai-signal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), marketData }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const data: SignalResult = await res.json();
      setResult(data);
      setHistory(prev => [data, ...prev].slice(0, 10));
    } catch (e: any) {
      setError(e.message || '分析失败');
    } finally { setLoading(false); }
  };

  const signalColor = (s: string) => s === 'BUY' ? 'text-green-400 bg-green-900/30 border-green-600' : s === 'SELL' ? 'text-red-400 bg-red-900/30 border-red-600' : 'text-yellow-400 bg-yellow-900/30 border-yellow-600';
  const confColor = (c: string) => c === 'HIGH' ? 'text-green-400' : c === 'MEDIUM' ? 'text-yellow-400' : 'text-gray-400';

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-600/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🤖</span>
          <div><h2 className="text-lg font-bold text-white">AI 交易信号分析</h2><p className="text-blue-400 text-xs">基于实时行情 + AI 模型分析，生成买卖信号</p></div>
        </div>
        <div className="flex gap-2">
          <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="输入股票代码，如 AAPL / 600519" onKeyDown={e => e.key === 'Enter' && analyze()}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none" />
          <button onClick={analyze} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-medium">{loading ? '🤖 分析中…' : '🔍 分析'}</button>
        </div>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm">{error}</div>}

      {result && (
        <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`px-4 py-1 rounded-lg text-lg font-black border-2 ${signalColor(result.signal)}`}>{result.signal}</span>
              <div><div className="text-sm text-white font-bold">{result.symbol}</div><div className={`text-xs ${confColor(result.confidence)}`}>置信度: {result.confidence}</div></div>
            </div>
            <div className="text-xs text-gray-500">{new Date(result.timestamp).toLocaleString('zh-CN')}</div>
          </div>
          <div className="text-sm text-gray-300 leading-relaxed bg-black/30 rounded p-3">{result.analysis}</div>
          <div className="text-xs text-gray-500">模型: {result.model}</div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">📋 信号历史</h3>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-800/40 rounded-lg p-2 border border-gray-700">
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${signalColor(h.signal)}`}>{h.signal}</span>
                <span className="text-sm text-white font-mono">{h.symbol}</span>
                <span className={`text-xs ${confColor(h.confidence)}`}>{h.confidence}</span>
                <span className="text-xs text-gray-500 ml-auto">{new Date(h.timestamp).toLocaleTimeString('zh-CN')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AgentsTab (NEW: launch Hermes agents) ────────────────────────────────────
function AgentsTab() {
  const [runningAgents, setRunningAgents] = useState<Record<string, { status: string; output: string[] }>>({});
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const esRefs = useRef<Record<string, EventSource>>({});

  const startAgent = async (agent: typeof AGENT_TEMPLATES[0]) => {
    setStarting(agent.slug); setError('');
    try {
      const res = await fetch('/api/herdr/agent/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: agent.name, argv: agent.argv, cwd: '/home/sz', focus: true }),
      });
      if (!res.ok) throw new Error(`启动失败: HTTP ${res.status}`);
      const data = await res.json();
      const agentId = data.agentId || data.terminal_id || data.pane_id || '';
      if (agentId) {
        setRunningAgents(prev => ({ ...prev, [agentId]: { status: 'starting', output: [] } }));
        // Open SSE stream
        const es = new EventSource(`/api/herdr/agent/stream?agentId=${encodeURIComponent(agentId)}`);
        esRefs.current[agentId] = es;
        es.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'output') {
              setRunningAgents(prev => ({ ...prev, [agentId]: { ...prev[agentId], status: 'working', output: [...(prev[agentId]?.output || []), msg.content].slice(-50) } }));
            } else if (msg.type === 'status') {
              setRunningAgents(prev => ({ ...prev, [agentId]: { ...prev[agentId], status: msg.content || 'working' } }));
            } else if (msg.type === 'error') {
              setRunningAgents(prev => ({ ...prev, [agentId]: { ...prev[agentId], status: 'error', output: [...(prev[agentId]?.output || []), '❌ ' + msg.content].slice(-50) } }));
            }
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => {
          setRunningAgents(prev => ({ ...prev, [agentId]: { ...prev[agentId], status: 'disconnected' } }));
          es.close(); delete esRefs.current[agentId];
        };
      }
    } catch (e: any) { setError(e.message || '启动 agent 失败'); }
    finally { setStarting(null); }
  };

  const stopAgent = async (agentId: string) => {
    try {
      await fetch('/api/herdr/agent/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId }) });
      esRefs.current[agentId]?.close(); delete esRefs.current[agentId];
      setRunningAgents(prev => { const next = { ...prev }; delete next[agentId]; return next; });
    } catch { /* ignore */ }
  };

  const statusColor = (s: string) => ({ working: 'text-amber-400', idle: 'text-gray-400', done: 'text-green-400', error: 'text-red-400', starting: 'text-blue-400', disconnected: 'text-gray-600' } as any)[s] || 'text-gray-400';

  return (
    <div className="p-4 space-y-3 overflow-y-auto h-full">
      <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 mb-2">
        <div className="flex items-center gap-2 mb-2"><span className="text-2xl">🧠</span>
          <div><h2 className="text-base font-bold text-white">Anthropic Financial Services Agents</h2><p className="text-xs text-gray-400">点击启动 Agent · 通过 Hermes 工作台运行 · 实时输出</p></div>
        </div>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 rounded p-2 text-red-300 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AGENT_TEMPLATES.map(agent => (
          <div key={agent.slug} className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 hover:border-gray-500 transition-all">
            <div className={`inline-block px-2 py-0.5 rounded text-xs font-bold text-white bg-gradient-to-r ${agent.color} mb-2`}>{agent.name}</div>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">{agent.desc}</p>
            <button onClick={() => startAgent(agent)} disabled={starting === agent.slug}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              {starting === agent.slug ? '⏳ 启动中…' : '🚀 启动 Agent'}
            </button>
          </div>
        ))}
      </div>

      {Object.entries(runningAgents).length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">🔄 运行中的 Agent</h3>
          {Object.entries(runningAgents).map(([agentId, state]) => (
            <div key={agentId} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700 mb-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${statusColor(state.status)}`}>● {state.status}</span>
                  <span className="text-xs text-gray-500 font-mono">{agentId.slice(0, 12)}…</span>
                </div>
                <button onClick={() => stopAgent(agentId)} className="text-xs text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-0.5">⏹ 停止</button>
              </div>
              {state.output.length > 0 && (
                <div className="bg-black/40 rounded p-2 text-xs font-mono text-gray-300 max-h-40 overflow-y-auto space-y-0.5">
                  {state.output.map((line, i) => <div key={i} className="whitespace-pre-wrap">{line}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StockAnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  return (
    <div className="page-shell flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      <NavBar title="📊 股票智能分析平台" />
      <div className="flex border-b border-gray-700 bg-gray-900 shrink-0">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? 'border-blue-500 text-blue-400 bg-gray-800' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}>
            <span className="text-base mr-1">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label.replace(/^[^\s]+\s/, '')}</span>
            <span className="sm:hidden">{tab.icon}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <iframe src="/stock/index.html" className="w-full h-full border-0" title="智能对话系统" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-forms" />}
        {activeTab === 'market' && <MarketTab />}
        {activeTab === 'aitrader' && <AITraderTab />}
        {activeTab === 'agents' && <AgentsTab />}
      </div>
    </div>
  );
}
