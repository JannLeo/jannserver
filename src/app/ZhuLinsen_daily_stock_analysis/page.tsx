'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import NavBar from '@/components/NavBar';

// ─── Types ───────────────────────────────────────────────────────────────────
interface QuoteData {
  stock_code: string;
  stock_name: string;
  current_price: number;
  change: number;
  change_percent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volume: number | null;
  amount: number | null;
  update_time: string;
}

interface AnalysisTask {
  task_id: string;
  stock_code: string;
  status: string;
  message: string;
}

// ─── Watch list ──────────────────────────────────────────────────────────────
const WATCH_LIST = [
  { code: '600519', name: '贵州茅台',   market: 'A股' },
  { code: '300750', name: '宁德时代',   market: 'A股' },
  { code: '002594', name: '比亚迪',     market: 'A股' },
  { code: '000858', name: '五粮液',     market: 'A股' },
  { code: '601318', name: '中国平安',   market: 'A股' },
  { code: '600036', name: '招商银行',   market: 'A股' },
  { code: 'hk00700', name: '腾讯控股',  market: '港股' },
  { code: 'hk09888', name: '阿里巴巴',  market: '港股' },
  { code: 'hk06969', name: '京东物流',  market: '港股' },
];

// ─── Utilities ───────────────────────────────────────────────────────────────
function fmtMoney(v: number | null | undefined, dec = 2): string {
  if (v == null) return '—';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtVolume(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万';
  return String(v);
}
function fmtTime(s: string): string {
  try { return new Date(s).toLocaleTimeString('zh-CN'); } catch { return s; }
}

// ─── Quote Card ─────────────────────────────────────────────────────────────
function QuoteCard({ item, data }: { item: typeof WATCH_LIST[0]; data?: QuoteData }) {
  const [loading, setLoading] = useState(!data);
  const up = data ? data.change >= 0 : true;
  const upClass = data ? (up ? 'text-green-400' : 'text-red-400') : 'text-gray-500';

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-xs text-gray-400 font-mono">{item.code}</div>
          <div className="text-sm font-semibold text-gray-800 mt-0.5">{item.name}</div>
        </div>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{item.market}</span>
      </div>

      {/* Price */}
      {loading ? (
        <div className="animate-pulse space-y-1 mt-2">
          <div className="h-6 bg-gray-200 rounded w-24"></div>
          <div className="h-4 bg-gray-100 rounded w-16"></div>
        </div>
      ) : data ? (
        <>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {data.current_price.toFixed(2)}
            {item.code.startsWith('hk') ? ' HKD' : ' CNY'}
          </div>
          <div className={`text-sm font-medium ${upClass} mt-1`}>
            {up ? '▲' : '▼'} {Math.abs(data.change).toFixed(2)} ({up ? '+' : ''}{data.change_percent.toFixed(2)}%)
          </div>
          {/* OHLC */}
          <div className="mt-3 grid grid-cols-2 gap-x-2 text-xs text-gray-500">
            <div>开: <span className="text-gray-700">{fmtMoney(data.open)}</span></div>
            <div>高: <span className="text-gray-700">{fmtMoney(data.high)}</span></div>
            <div>低: <span className="text-gray-700">{fmtMoney(data.low)}</span></div>
            <div>量: <span className="text-gray-700">{fmtVolume(data.volume)}</span></div>
          </div>
          {data.update_time && (
            <div className="text-xs text-gray-400 mt-2">{fmtTime(data.update_time)}</div>
          )}
        </>
      ) : (
        <div className="text-sm text-gray-400 mt-2">暂无数据</div>
      )}
    </div>
  );
}

// ─── Search ─────────────────────────────────────────────────────────────────
function SearchSection({ onSelect }: { onSelect: (code: string) => void }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<QuoteData | null>(null);

  const doSearch = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const res = await fetch(`/api/dsa/stocks/${encodeURIComponent(code.trim())}/quote`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail?.message || json.message || '查询失败');
      } else {
        setPreview(json);
      }
    } catch {
      setError('网络错误，请检查后端服务');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    doSearch(input.trim());
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入股票代码，如 600519、hk00700"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          {loading ? '查询…' : '查询'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{error}</div>
      )}

      {preview && (
        <div className="bg-white rounded-lg p-4 shadow-sm border border-green-300">
          <div className="flex justify-between items-center mb-2">
            <div>
              <div className="font-bold text-gray-900">{preview.stock_name}</div>
              <div className="text-xs text-gray-400 font-mono">{preview.stock_code}</div>
            </div>
            <button
              onClick={() => onSelect(preview.stock_code)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
            >
              分析
            </button>
          </div>
          <div className="flex gap-4 items-end">
            <div className="text-3xl font-bold text-gray-900">{preview.current_price.toFixed(2)}</div>
            <div className={`text-lg font-medium ${preview.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {preview.change >= 0 ? '▲' : '▼'} {Math.abs(preview.change).toFixed(2)} ({preview.change >= 0 ? '+' : ''}{preview.change_percent.toFixed(2)}%)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analysis Section ────────────────────────────────────────────────────────
function AnalysisSection({ inputCode, onInputChange }: { inputCode: string; onInputChange: (v: string) => void }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState<AnalysisTask[]>([]);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAnalysis = async () => {
    const code = inputCode.trim();
    if (!code) return;
    setAnalyzing(true);
    setError('');
    setTaskStatus('');
    setTaskId('');
    try {
      const res = await fetch(`/api/dsa/analysis/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_code: code, async_mode: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail?.message || json.message || '启动分析失败');
        setAnalyzing(false);
        return;
      }
      const tid = json.task_id;
      setTaskId(tid);
      setTasks(prev => [{ task_id: tid, stock_code: code, status: 'pending', message: '分析中…' }, ...prev]);
      setPolling(true);
    } catch {
      setError('网络错误');
      setAnalyzing(false);
    }
  };

  // Poll task status
  useEffect(() => {
    if (!polling || !taskId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/dsa/analysis/status/${taskId}`);
        if (!res.ok) return;
        const json = await res.json();
        setTaskStatus(json.status || json.state || '');
        if (json.status === 'completed' || json.state === 'done') {
          setPolling(false);
          setAnalyzing(false);
          setTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, status: 'completed', message: '分析完成 ✅' } : t));
        } else if (json.status === 'failed' || json.state === 'error') {
          setPolling(false);
          setAnalyzing(false);
          setTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, status: 'failed', message: '分析失败 ❌' } : t));
        }
      } catch { /* silent */ }
      pollRef.current = setTimeout(poll, 3000);
    };
    pollRef.current = setTimeout(poll, 2000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [polling, taskId]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={inputCode}
          onChange={e => onInputChange(e.target.value)}
          placeholder="输入股票代码开始 AI 分析"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          onKeyDown={e => e.key === 'Enter' && startAnalysis()}
        />
        <button
          onClick={startAnalysis}
          disabled={analyzing || !inputCode.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          {analyzing ? '分析中…' : '🤖 启动 AI 分析'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-600 text-sm">{error}</div>}

      {taskStatus && (
        <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-2">
          状态: <span className="font-medium">{taskStatus}</span>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-gray-400 uppercase">分析历史</h4>
          {tasks.map(t => (
            <div key={t.task_id} className="flex items-center gap-3 text-sm bg-white rounded p-3 border border-gray-100">
              <span className="font-mono text-gray-500 text-xs">{t.stock_code}</span>
              <span className="text-gray-700">{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'market',   label: '📊 市场' },
  { id: 'search',   label: '🔍 搜索' },
  { id: 'analysis', label: '🤖 AI 分析' },
];

// ─── Page ────────────────────────────────────────────────────────────────────
export default function DailyStockAnalysisPage() {
  const [activeTab, setActiveTab] = useState('market');
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [backendOk, setBackendOk] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [analysisInputCode, setAnalysisInputCode] = useState('');

  // Health check + load quotes
  const loadQuotes = useCallback(async () => {
    try {
      const hr = await fetch('/api/dsa/health');
      if (!hr.ok) throw new Error('Backend down');
      setBackendOk(true);
    } catch {
      setBackendOk(false);
      return;
    }

    // Fetch all watchlist quotes in parallel
    const codes = WATCH_LIST.map(w => w.code);
    await Promise.allSettled(
      codes.map(async (code) => {
        try {
          const res = await fetch(`/api/dsa/stocks/${encodeURIComponent(code)}/quote`);
          if (res.ok) {
            const data = await res.json();
            setQuotes(prev => ({ ...prev, [code]: data }));
          }
        } catch { /* silent */ }
      })
    );
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    loadQuotes();
    const interval = setInterval(loadQuotes, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [loadQuotes]);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">
            股票智能分析 <span className="text-blue-400">Daily Stock Analysis</span>
          </h1>
          <p className="text-slate-400 text-sm">
            数据来源：efinance · akshare · baostock · yfinance（免费数据）
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${backendOk ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full ${backendOk ? 'bg-green-400' : 'bg-red-400'}`}></span>
              {backendOk ? '后端运行中' : '后端离线'}
            </span>
            {lastRefresh && (
              <span className="text-xs text-slate-500">
                {lastRefresh.toLocaleTimeString()} 更新
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex border-b border-gray-200 mt-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto flex items-center">
            <button
              onClick={loadQuotes}
              className="text-xs text-gray-400 hover:text-blue-500 px-3 py-3"
            >
              ↻ 刷新
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="py-6">
          {activeTab === 'market' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">自选股监控</h2>
                <span className="text-xs text-gray-400">{Object.keys(quotes).length}/{WATCH_LIST.length} 只已加载</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {WATCH_LIST.map(item => (
                  <QuoteCard key={item.code} item={item} data={quotes[item.code]} />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">股票搜索</h2>
              <SearchSection onSelect={(code) => { setAnalysisInputCode(code); setActiveTab('analysis'); }} />
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">AI 智能分析</h2>
              <p className="text-sm text-gray-500 mb-4">
                输入股票代码，系统将自动抓取数据并调用 AI 生成分析报告。免费数据源全程无需付费。
              </p>
              <AnalysisSection inputCode={analysisInputCode} onInputChange={setAnalysisInputCode} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}