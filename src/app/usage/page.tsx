'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

interface UsageSummary {
  balance: number | null;
  usedToday: number | null;
  used7d: number | null;
  used30d: number | null;
  requestCountToday: number | null;
  tokenCountToday: number | null;
}

interface DailyItem {
  date: string;
  cost: number;
  requests: number;
  tokens: number;
}

interface ByModelItem {
  model: string;
  cost: number;
  requests: number;
  tokens: number;
}

interface ByChannelItem {
  channel: string;
  cost: number;
  requests: number;
  tokens: number;
}

interface RecentLog {
  time: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  status: 'success' | 'error';
}

interface UsageResult {
  configured: boolean;
  source: string;
  baseUrl: string | null;
  summary: UsageSummary | null;
  daily: DailyItem[];
  byModel: ByModelItem[];
  byChannel: ByChannelItem[];
  recentLogs: RecentLog[];
  error: string | null;
}

type RangeOption = 'today' | '7d' | '30d';

function formatCost(n: number | null | undefined): string {
  if (n == null) return '-';
  return `¥${n.toFixed(2)}`;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '-';
  return n.toLocaleString();
}

export default function UsagePage() {
  const [range, setRange] = useState<RangeOption>('7d');
  const [data, setData] = useState<UsageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async (r: RangeOption) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/new-api/usage?range=${r}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setError(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage(range);
  }, [range, fetchUsage]);

  const summary = data?.summary;
  const maxModelCost = data?.byModel && data.byModel.length > 0 ? Math.max(...data.byModel.map(m => m.cost), 0.0001) : 1;
  const maxChannelCost = data?.byChannel && data.byChannel.length > 0 ? Math.max(...data.byChannel.map(c => c.cost), 0.0001) : 1;
  const maxDailyCost = data?.daily && data.daily.length > 0 ? Math.max(...data.daily.map(d => d.cost), 0.0001) : 1;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="💳 AI 使用情况" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {(['today', '7d', '30d'] as RangeOption[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-1.5 text-sm rounded-md transition ${
                  range === r
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {r === 'today' ? '今天' : r === '7d' ? '7 天' : '30 天'}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchUsage(range)}
            disabled={loading}
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? '刷新中...' : '🔄 刷新'}
          </button>
        </div>

        {/* 未配置提示 */}
        {data && !data.configured && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center mb-6">
            <p className="text-yellow-700 font-medium mb-2">new-api 统计未配置</p>
            <p className="text-sm text-yellow-600">
              需配置环境变量 <code className="bg-yellow-100 px-1.5 py-0.5 rounded">NEW_API_ADMIN_TOKEN</code>
            </p>
          </div>
        )}

        {/* 错误提示 */}
        {data && data.configured && data.error && !data.summary && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mb-6">
            <p className="text-red-700 font-medium mb-2">⚠️ 获取失败</p>
            <p className="text-sm text-red-600">{data.error}</p>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <SummaryCard label="当前余额" value={summary.balance != null
                ? (summary.balance >= 1_000_000_000
                    ? `¥${(summary.balance / 1_000_000_000).toFixed(2)}亿`
                    : summary.balance >= 10_000
                      ? `¥${(summary.balance / 10_000).toFixed(2)}万`
                      : `¥${summary.balance.toFixed(2)}`)
                : '-'} accent="blue" />
            <SummaryCard label="今日消耗" value={formatCost(summary.usedToday)} accent="red" />
            <SummaryCard label="7 日消耗" value={formatCost(summary.used7d)} accent="orange" />
            <SummaryCard label="30 日消耗" value={formatCost(summary.used30d)} accent="amber" />
            <SummaryCard label="今日请求" value={formatNumber(summary.requestCountToday)} accent="indigo" />
            <SummaryCard label="今日 tokens" value={formatTokens(summary.tokenCountToday)} accent="purple" />
          </div>
        )}

        {/* 数据表格区 */}
        {data && data.configured && summary && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 每日使用量 */}
            <Card title="📅 每日使用量" count={data.daily.length}>
              {data.daily.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-1.5">
                  {data.daily.slice(0, 10).map(d => (
                    <div key={d.date} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-slate-500 w-24 flex-shrink-0">{d.date}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                        <div
                          className="bg-blue-400 h-full rounded-full"
                          style={{ width: `${(d.cost / maxDailyCost) * 100}%` }}
                        />
                      </div>
                      <span className="text-slate-700 w-16 text-right">¥{d.cost.toFixed(2)}</span>
                      <span className="text-slate-400 w-12 text-right">{d.requests}次</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 按模型统计 */}
            <Card title="🤖 按模型统计" count={data.byModel.length}>
              {data.byModel.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-1.5">
                  {data.byModel.slice(0, 10).map(m => (
                    <div key={m.model} className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-slate-700 truncate w-32 flex-shrink-0" title={m.model}>{m.model}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="bg-indigo-400 h-full rounded-full"
                          style={{ width: `${(m.cost / maxModelCost) * 100}%` }}
                        />
                      </div>
                      <span className="text-slate-700 w-16 text-right">¥{m.cost.toFixed(2)}</span>
                      <span className="text-slate-400 w-12 text-right">{m.requests}次</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 按渠道统计 */}
            <Card title="🔀 按渠道统计" count={data.byChannel.length}>
              {data.byChannel.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-1.5">
                  {data.byChannel.slice(0, 10).map(c => (
                    <div key={c.channel} className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-slate-700 truncate w-32 flex-shrink-0" title={c.channel}>{c.channel}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-full rounded-full"
                          style={{ width: `${(c.cost / maxChannelCost) * 100}%` }}
                        />
                      </div>
                      <span className="text-slate-700 w-16 text-right">¥{c.cost.toFixed(2)}</span>
                      <span className="text-slate-400 w-12 text-right">{c.requests}次</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 最近调用记录 */}
            <Card title="📋 最近调用" count={data.recentLogs.length}>
              {data.recentLogs.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {data.recentLogs.slice(0, 15).map((log, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-slate-50 last:border-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-mono text-slate-400 w-32 flex-shrink-0 truncate" title={log.time}>{log.time}</span>
                      <span className="font-medium text-slate-700 truncate flex-1" title={log.model}>{log.model || '-'}</span>
                      <span className="text-slate-500 w-16 text-right">{formatTokens(log.totalTokens)}</span>
                      <span className="text-slate-700 w-14 text-right">¥{log.cost.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* 底部返回 */}
        <div className="mt-8 text-center">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-blue-600">
            ← 返回工作台
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  const accentMap: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
  };
  return (
    <div className={`border rounded-xl p-3 ${accentMap[accent] || 'border-slate-200 bg-white'}`}>
      <div className="text-xs opacity-70 mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
        {count != null && <span className="text-xs text-slate-400">{count}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>;
}
