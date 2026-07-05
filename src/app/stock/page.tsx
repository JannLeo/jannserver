'use client';
import { useState, useEffect, useCallback } from 'react';
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

// ─── Tab definitions ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'chat',    label: '💬 智能对话',     icon: '💬' },
  { id: 'market',  label: '📊 市场数据',     icon: '📊' },
  { id: 'aitrader',label: '🤖 AI 交易信号',  icon: '🤖' },
  { id: 'agents',  label: '🧠 AI Agent 工作流', icon: '🧠' },
] as const;
type TabId = typeof TABS[number]['id'];

// ─── Agent templates from anthropics/financial-services ──────────────────────
const AGENT_TEMPLATES = [
  {
    slug: 'earnings-reviewer',
    name: 'Earnings Reviewer',
    desc: '分析财报电话会议，提取关键财务指标和管理层语调变化',
    color: 'from-blue-500 to-blue-700',
  },
  {
    slug: 'market-researcher',
    name: 'Market Researcher',
    desc: '多源市场情报收集，分析行业趋势和竞争格局',
    color: 'from-green-500 to-green-700',
  },
  {
    slug: 'valuation-reviewer',
    name: 'Valuation Reviewer',
    desc: '多维度估值分析（DCF/Comparable/DDM），发现定价偏差',
    color: 'from-amber-500 to-amber-700',
  },
  {
    slug: 'kyc-screener',
    name: 'KYC Screener',
    desc: '交易对手尽职调查，核查制裁名单和关联风险',
    color: 'from-red-500 to-red-700',
  },
  {
    slug: 'pitch-agent',
    name: 'Pitch Agent',
    desc: '生成投资pitch deck，包含估值叙事和催化剂分析',
    color: 'from-purple-500 to-purple-700',
  },
  {
    slug: 'model-builder',
    name: 'Model Builder',
    desc: '构建和验证金融模型（预测/估值/风险），输出结构化报告',
    color: 'from-cyan-500 to-cyan-700',
  },
  {
    slug: 'statement-auditor',
    name: 'Statement Auditor',
    desc: '审计财务报表，识别会计异常和潜在操纵信号',
    color: 'from-orange-500 to-orange-700',
  },
  {
    slug: 'meeting-prep-agent',
    name: 'Meeting Prep Agent',
    desc: '生成分析师会议备忘卡片，追踪管理层历史表态',
    color: 'from-pink-500 to-pink-700',
  },
  {
    slug: 'gl-reconciler',
    name: 'GL Reconciler',
    desc: '总账核对与调整，自动化账目匹配和问题追溯',
    color: 'from-teal-500 to-teal-700',
  },
  {
    slug: 'month-end-closer',
    name: 'Month-End Closer',
    desc: '月末结账流程跟踪，提示未清项目和预警节点',
    color: 'from-indigo-500 to-indigo-700',
  },
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

// ─── Components ───────────────────────────────────────────────────────────────

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
      setData(prev => ({
        ...prev,
        [symbol]: {
          symbol,
          name: info.name || info.name_cn || symbol,
          price,
          change: chg,
          change_pct: prev > 0 ? (chg / prev) * 100 : 0,
          volume: parseInt(info.volume || 0),
          market: info.market || 'unknown',
        },
      }));
    } catch {
      // silent fail – keep whatever we had
    }
  }, []);

  useEffect(() => {
    // fetch health first
    fetch('/api/v1/fincept/stock/health')
      .then(r => r.json())
      .then(() => {
        setLoading(true);
        Promise.all(WATCH_LIST.map(w => fetchStock(w.symbol)))
          .finally(() => setLoading(false));
      })
      .catch(() => {
        setError('⚠️ Fincept API 未运行（请确保 fincept-api.service 已启动）');
        setLoading(false);
      });
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
      {/* API status */}
      {error ? (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm">{error}</div>
      ) : (
        <div className="bg-green-900/20 border border-green-700 rounded p-2 text-green-400 text-xs">
          ✅ Fincept API 已连接 → localhost:18080
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={inputSymbol}
          onChange={e => setInputSymbol(e.target.value)}
          placeholder="输入股票代码，如 AAPL / 600519"
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
        >
          {loading ? '查询中…' : '查询'}
        </button>
      </form>

      {/* US stocks */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">🇺🇸 美股</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {WATCH_LIST.filter(w => w.market === 'US').map(w => (
            <MarketCard key={w.symbol} item={w} data={data[w.symbol]} />
          ))}
        </div>
      </div>

      {/* A-shares */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">🇨🇳 A股</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {WATCH_LIST.filter(w => w.market === 'A').map(w => (
            <MarketCard key={w.symbol} item={w} data={data[w.symbol]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketCard({ item, data }: { item: typeof WATCH_LIST[0]; data?: MarketData }) {
  if (!data) {
    return (
      <div className="bg-gray-800/50 rounded p-3 border border-gray-700">
        <div className="text-xs text-gray-400">{item.symbol}</div>
        <div className="text-sm text-gray-500 mt-1">{item.name}</div>
        <div className="text-xs text-gray-600 mt-1">加载中…</div>
      </div>
    );
  }
  const up = data.change >= 0;
  return (
    <div className="bg-gray-800/50 rounded p-3 border border-gray-700 hover:border-gray-500 transition-colors">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs font-mono text-gray-300">{data.symbol}</div>
          <div className="text-sm text-white mt-0.5">{data.name}</div>
        </div>
        <div className={`text-xs font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>
          {up ? '+' : ''}{data.change.toFixed(2)}
        </div>
      </div>
      <div className="flex justify-between items-end mt-2">
        <div className="text-lg font-bold text-white">${data.price.toFixed(2)}</div>
        <div className={`text-xs ${up ? 'text-green-400' : 'text-red-400'}`}>
          {up ? '▲' : '▼'} {Math.abs(data.change_pct).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

function AITraderTab() {
  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-600/40 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">🤖</span>
          <div>
            <h2 className="text-xl font-bold text-white">AI-Trader</h2>
            <p className="text-blue-400 text-sm">HKUDS · Agent 原生交易平台</p>
          </div>
          <a
            href="https://ai4trade.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            访问平台 →
          </a>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed">
          AI-Trader 是<strong className="text-white">专为 AI Agent 打造的交易平台</strong>，
          支持任意 Agent（Claude Code / Codex / nanobot 等）通过一句话指令接入平台，
          进行群体智能讨论、信号共享和一键跟单。覆盖股票、加密货币、外汇、期权、期货等市场。
        </p>
      </div>

      {/* Core features */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: '🤖', title: '即时接入任意 Agent', desc: '发送一句指令，Agent 立即加入平台协作' },
          { icon: '💬', title: '群体智能交易', desc: '多 Agent 辩论，自动沉淀优质交易想法' },
          { icon: '📡', title: '跨平台信号同步', desc: '保留现有券商，同时同步信号到社区' },
          { icon: '⭐', title: '激励系统', desc: '发布信号吸引跟随者，获得积分奖励' },
        ].map(f => (
          <div key={f.title} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700">
            <div className="text-2xl mb-1">{f.icon}</div>
            <div className="text-sm font-semibold text-white">{f.title}</div>
            <div className="text-xs text-gray-400 mt-1">{f.desc}</div>
          </div>
        ))}
      </div>

      {/* API section */}
      <div className="bg-gray-800/40 rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-bold text-white mb-2">🔌 API 接入</h3>
        <p className="text-xs text-gray-400 mb-3">
          AI-Trader OpenAPI: <span className="text-blue-400 font-mono">https://api.ai4trade.ai</span>
        </p>
        <div className="bg-black/40 rounded p-3 font-mono text-xs text-gray-300 space-y-1">
          <div><span className="text-green-500"># 给 Agent 发送以下指令即可接入：</span></div>
          <div>Read https://ai4trade.ai/SKILL.md and register.</div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          AI-Trader 支持 Alpha Vantage + yfinance 双数据源，提供美股/A股/加密等全市场覆盖。
          可通过 <span className="text-blue-400">/financial-events</span> 面板统一查看交易洞察。
        </div>
      </div>
    </div>
  );
}

function AgentsTab() {
  return (
    <div className="p-4 space-y-3 overflow-y-auto h-full">
      <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🧠</span>
          <div>
            <h2 className="text-base font-bold text-white">Anthropic Financial Services Agents</h2>
            <p className="text-xs text-gray-400">来源: anthropics/financial-services · 10 个金融工作流模板</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          以下 Agent 来自 Anthropic 官方金融插件仓库，支持 Earnings Review、Market Research、
          Valuation、Audit 等完整投研流程。可作为 JanServer 股票分析的 AI Agent 技能基础。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AGENT_TEMPLATES.map(agent => (
          <div
            key={agent.slug}
            className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 hover:border-gray-500 transition-all group"
          >
            <div className={`inline-block px-2 py-0.5 rounded text-xs font-bold text-white bg-gradient-to-r ${agent.color} mb-2`}>
              {agent.name}
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{agent.desc}</p>
            <div className="mt-2 flex gap-2">
              <span className="text-xs text-gray-600">plugins/agent-plugins/{agent.slug}/</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StockAnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  return (
    <div className="page-shell flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      <NavBar title="📊 股票智能分析平台" />

      {/* Tab bar */}
      <div className="flex border-b border-gray-700 bg-gray-900 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-400 bg-gray-800'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            <span className="text-base mr-1">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label.replace(/^[^\s]+\s/, '')}</span>
            <span className="sm:hidden">{tab.icon}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <iframe
            src="/stock/index.html"
            className="w-full h-full border-0"
            title="智能对话系统"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-forms"
          />
        )}
        {activeTab === 'market' && <MarketTab />}
        {activeTab === 'aitrader' && <AITraderTab />}
        {activeTab === 'agents' && <AgentsTab />}
      </div>
    </div>
  );
}