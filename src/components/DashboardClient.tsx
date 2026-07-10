'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduledDate?: string | null;
  completedAt?: string | null;
}

interface IntegratedRepo {
  name: string;
  safeName: string;
}

interface UsageSummary {
  balance: number | null;
  usedToday: number | null;
  used7d: number | null;
  used30d: number | null;
  requestCountToday: number | null;
  tokenCountToday: number | null;
}

interface DailySummaryData {
  configured: boolean;
  summary?: string;
  content?: string;
  error?: string;
}

interface DashboardData {
  todayDate: string;
  todayTasks: Task[];
  undoneTasks: Task[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Task Item ───────────────────────────────────────────────────────────────
function TaskItem({ task, onToggle, toggling }: {
  task: Task;
  onToggle: (id: string, status: string) => void;
  toggling: boolean;
}) {
  const isDone = task.status === 'done';
  const isHigh = task.priority === 'high' && !isDone;
  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-transparent bg-white/45 p-3 transition hover:border-stone-900/10 hover:bg-white/80 hover:shadow-sm">
      <button
        onClick={() => onToggle(task.id, task.status)}
        disabled={toggling}
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${
          isDone
            ? 'border-teal-600 bg-teal-600 text-white'
            : 'border-stone-300 bg-white/70 hover:border-teal-500'
        } ${toggling ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        {isDone && (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span className={`min-w-0 flex-1 text-sm font-bold ${isDone ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
        {task.title}
      </span>
      {isHigh && (
        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-black text-red-600">高优先</span>
      )}
    </div>
  );
}

// ─── Stat Badge ──────────────────────────────────────────────────────────────
function StatBadge({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-2xl bg-white/40 px-4 py-3 border border-stone-200/60">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tracking-[-0.04em] ${tone}`}>{value}</p>
    </div>
  );
}

// ─── Source Badge ────────────────────────────────────────────────────────────
function getTypeLabel(docType: string): string {
  const labels: Record<string, string> = { note: '笔记', memo: '备忘', daily: '日报', github_md: '文档' };
  return labels[docType] || docType;
}

// ─── Usage Section ───────────────────────────────────────────────────────────
function UsageSection({ summary }: { summary: UsageSummary | null }) {
  if (!summary) return null;

  const f = (n: number | null | undefined) => {
    if (n == null) return '-';
    return n >= 1 ? `¥${n.toFixed(2)}` : `¥${(n * 100).toFixed(2)}¢`;
  };

  const fmtBalance = (b: number) => {
    if (b >= 1_000_000_000) return `¥${(b / 1_000_000_000).toFixed(2)}亿`;
    if (b >= 10_000) return `¥${(b / 10_000).toFixed(2)}万`;
    return `¥${b.toFixed(2)}`;
  };

  const fmtTokens = (n: number | null | undefined): string => {
    if (n == null) return '-';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  // 估算当日用量百分比（假设每日预算为余额的 0.5% 作为参考线）
  const balance = summary.balance ?? 0;
  const usedToday = summary.usedToday ?? 0;
  const dailyBudget = balance * 0.005;
  const usagePct = dailyBudget > 0 ? Math.min((usedToday / dailyBudget) * 100, 100) : 0;

  return (
    <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-5 shadow-sm">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">💳 用量概览</h2>
        <a href="/usage" className="text-[10px] font-bold text-teal-700 hover:underline">
          查看详情 →
        </a>
      </div>

      {/* 余额大数字 */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-black tracking-[-0.04em] text-stone-900">
          {summary.balance != null ? fmtBalance(summary.balance) : '-'}
        </span>
        <span className="text-xs text-stone-400 font-semibold">当前余额</span>
      </div>

      {/* 今日用量进度条 */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-stone-500 mb-1.5">
          <span className="font-semibold">今日用量</span>
          <span className="font-bold text-stone-700">
            {f(usedToday)}
            <span className="font-normal text-stone-400"> / {dailyBudget > 0 ? fmtBalance(dailyBudget) : '-'}</span>
          </span>
        </div>
        <div className="h-2.5 bg-stone-200/70 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${usagePct}%`,
              background: usagePct > 80
                ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                : usagePct > 50
                  ? 'linear-gradient(90deg, #0f766e, #f59e0b)'
                  : 'linear-gradient(90deg, #14b8a6, #0f766e)',
            }}
          />
        </div>
      </div>

      {/* 指标网格 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/50 border border-stone-200/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-stone-400">今日消耗</p>
          <p className="mt-0.5 text-lg font-black tracking-[-0.03em] text-stone-800">
            {f(usedToday)}
          </p>
        </div>
        <div className="rounded-xl bg-white/50 border border-stone-200/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-stone-400">今日请求</p>
          <p className="mt-0.5 text-lg font-black tracking-[-0.03em] text-stone-800">
            {summary.requestCountToday ?? '-'}
          </p>
        </div>
        <div className="rounded-xl bg-white/50 border border-stone-200/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-stone-400">7 日消耗</p>
          <p className="mt-0.5 text-lg font-black tracking-[-0.03em] text-stone-800">
            {f(summary.used7d)}
          </p>
        </div>
      </div>

      {/* Token 信息条 */}
      <div className="mt-3 pt-3 border-t border-stone-200/60 flex items-center gap-3 text-xs text-stone-400">
        <span>
          Tokens <strong className="font-bold text-stone-600">{fmtTokens(summary.tokenCountToday)}</strong>
        </span>
        {summary.used30d != null && (
          <span>
            30日 <strong className="font-bold text-stone-600">{f(summary.used30d)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Trending Optimization Section ──────────────────────────────────────────
function TrendingOptimizationSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [integrating, setIntegrating] = useState<Record<string, string>>({});
  const [shuffleSeed, setShuffleSeed] = useState(0);

  useEffect(() => {
    fetch(`/api/ai/trending-analysis?since=weekly&skip_ai=1&seed=${shuffleSeed}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); }
        else { setData(d); }
        setLoading(false);
      })
      .catch(() => {
        // skip_ai 也失败 → 标记错误但继续尝试 AI 模式
        setError('获取趋势失败，尝试 AI 分析...');
        setLoading(false);
        // 2. 回退：带 AI 分析的完整请求（可能较慢）
        setAiAnalyzing(true);
        fetch('/api/ai/trending-analysis?since=weekly')
          .then(r => r.json())
          .then(d => {
            if (!d.error && d.recommendations?.length > 0) setData(d);
          })
          .catch(() => {})
          .finally(() => setAiAnalyzing(false));
      });
  }, [shuffleSeed]);

  const handleIntegrate = async (repo: any) => {
    const key = repo.name || repo.fullName;
    const repoUrl = `https://github.com/${key}`;
    setIntegrating(prev => ({ ...prev, [key]: 'integrating' }));
    try {
      const res = await fetch('/api/ai/integrate-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          repoName: key,
          integrationSteps: repo.integrationSteps || '',
          complexity: repo.complexity || 'medium',
          effortHours: repo.effortHours || 2,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        console.error('[integrate] failed:', result.error);
        setIntegrating(prev => ({ ...prev, [key]: 'error' }));
      } else {
        setIntegrating(prev => ({ ...prev, [key]: 'done' }));
        setTimeout(() => setIntegrating(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        }), 5000);
      }
    } catch (err) {
      console.error('[integrate] error:', err);
      setIntegrating(prev => ({ ...prev, [key]: 'error' }));
    }
  };

  const complexityBadge = (c: string) => {
    const colors: Record<string, string> = {
      low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      medium: 'bg-amber-100 text-amber-700 border-amber-200',
      high: 'bg-red-100 text-red-700 border-red-200',
    };
    const labels: Record<string, string> = { low: '简单', medium: '中等', high: '复杂' };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[c] || colors.medium}`}>
        {labels[c] || c}
      </span>
    );
  };

  if (loading) return <div className="animate-pulse h-24 bg-stone-100 rounded-2xl" />;
  if (error && !data) return <p className="text-xs text-red-500">{error}</p>;
  if (!data) return null;

  const { analysis, recommendations, totalRepos } = data;

  return (
    <div className="space-y-3">
      {analysis && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-stone-500">{analysis}</p>
          <button
            onClick={() => setShuffleSeed(s => s + 1)}
            className="flex-shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 font-bold transition-colors"
            title="换一批仓库"
          >
            🔄 换一换
          </button>
        </div>
      )}
      {recommendations.length === 0 ? (
        <p className="text-sm text-stone-400">暂无适合的仓库推荐</p>
      ) : (
        <div className="space-y-2">
          {recommendations.slice(0, 20).map((repo: any) => {
            const key = repo.name || repo.fullName;
            const status = integrating[key];
            return (
              <div key={key}
                className="rounded-xl border border-stone-200 bg-white/70 p-3 transition hover:border-amber-300/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-stone-800 truncate">{key}</span>
                      <span className="text-[10px] text-stone-400">{repo.language}</span>
                      {repo.todayStars && (
                        <span className="text-[10px] text-amber-600 font-semibold">{repo.todayStars}</span>
                      )}
                      {complexityBadge(repo.complexity)}
                    </div>
                    {repo.description && (
                      <p className="mt-1 text-[10px] text-stone-400 line-clamp-2">{repo.description}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-stone-500 line-clamp-1">{repo.reason}</p>
                    {repo.integrationSteps && repo.integrationSteps !== '需手动分析整合方式' && (
                      <p className="mt-0.5 text-[10px] text-stone-400 line-clamp-1">{repo.integrationSteps}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {status === 'integrating' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-teal-100 text-teal-700 text-[11px] font-bold">
                        <span className="inline-block w-2.5 h-2.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                        整合中
                      </span>
                    )}
                    {status === 'done' && (
                      <span className="inline-block px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                        ✓ 已创建任务
                      </span>
                    )}
                    {status === 'error' && (
                      <span className="inline-block px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-[11px] font-bold">
                        ✗ 失败
                      </span>
                    )}
                    {!status && (
                      <button
                        onClick={() => handleIntegrate(repo)}
                        className="px-3 py-1.5 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-bold transition-colors whitespace-nowrap"
                      >
                        🤖 让 AI 整合
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {aiAnalyzing && (
        <div className="flex items-center gap-2 text-[10px] text-stone-400">
          <span className="inline-block w-2.5 h-2.5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <span>AI 正在深度分析推荐...</span>
        </div>
      )}
      {error && (
        <p className="text-[10px] text-stone-400">{error}</p>
      )}
      <div className="pt-2 border-t border-stone-100">
        <a href="/trending" className="text-[10px] font-bold text-teal-700 hover:underline">
          查看全部趋势 →
        </a>
      </div>
    </div>
  );
}

// ─── Ask QA Section ──────────────────────────────────────────────────────────
function AskSection({ todayDate }: { todayDate: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const q = question.trim();
    if (!q) return;
    setLoading(true); setError(''); setAnswer('');
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '请求失败'); return; }
      setAnswer(data.answer || '无结果');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="向知识库提问…"
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-white/60 text-sm focus:outline-none focus:border-teal-500"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !question.trim()}
          className="px-3 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? '…' : '提问'}
        </button>
      </div>
      {loading && <p className="mt-2 text-xs text-stone-400 animate-pulse">查询知识库中…</p>}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {answer && (
        <div className="mt-2 p-3 rounded-2xl bg-white/60 border border-stone-200 text-sm text-stone-700 leading-relaxed max-h-40 overflow-y-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// ─── Overview Section ────────────────────────────────────────────────────────
function OverviewSection({ tasks }: { tasks: Task[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">今日任务</h2>
        <span className="text-xs font-bold text-stone-500">{tasks.filter(t => t.status === 'done').length}/{tasks.length}</span>
      </div>
      {tasks.length > 0 ? (
        <div className="space-y-1.5">
          {tasks.slice(0, 6).map(task => (
            <div key={task.id} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${task.status === 'done' ? 'bg-teal-500' : task.priority === 'high' ? 'bg-red-400' : 'bg-stone-300'}`} />
              <span className={`text-xs ${task.status === 'done' ? 'line-through text-stone-400' : 'text-stone-700'}`}>{task.title}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/30 p-6 text-center">
          <p className="text-xs text-stone-500">今天还没有任务</p>
          <Link href="/tasks" className="mt-2 inline-block text-xs font-bold text-teal-700 hover:underline">去创建 →</Link>
        </div>
      )}
    </div>
  );
}

// ─── Top Section ─────────────────────────────────────────────────────────────
function TopSection({ todayDate, initialTasks, integratedRepos }: {
  todayDate: string;
  initialTasks: Task[];
  integratedRepos: IntegratedRepo[];
}) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [undoneTasks, setUndoneTasks] = useState<Task[]>(initialTasks.filter((tk: Task) => tk.status !== 'done'));

  useEffect(() => {
    // Refresh usage from server
    fetch('/api/new-api/usage').then(r => r.json()).catch(() => null)
      .then(u => { if (u && u.summary) setUsage(u.summary); });
  }, [todayDate]);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';
    setTogglingId(id);
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
      setUndoneTasks(prev =>
        newStatus === 'done'
          ? prev.filter(t => t.id !== id)
          : [...prev, tasks.find(t => t.id === id)!]
      );
    } catch {}
    setTogglingId(null);
  };

  return (
    <section>
      {/* 用量概览 - 独占一行大卡片 */}
      <div className="mb-4">
        <UsageSection summary={usage} />
      </div>

      {/* 知识库提问 - 放在每日趋势上面 */}
      <div className="mb-4 rounded-2xl border border-stone-900/10 bg-white/55 p-6 shadow-sm">
        <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">💬 知识库提问</h2>
        <div className="mt-4">
          <AskSection todayDate={todayDate} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-1">
        {/* AI 优化：Trending 仓库分析 + 整合推荐 */}
        <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
          <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">🔥 每日趋势 · AI 整合推荐</h2>
          <p className="text-[10px] text-stone-400 mt-0.5 mb-3">每日更新，可滚动查看更多 → 点击让 AI 整合到工作台</p>
          <TrendingOptimizationSection />
        </div>

        {/* Overview */}
        <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
          <OverviewSection tasks={tasks} />
        </div>

        {/* 语音助手快捷入口 */}
        <div className="rounded-2xl border border-teal-200/60 bg-gradient-to-br from-teal-50/80 to-white/55 p-4 shadow-sm hover:border-teal-400/60 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black tracking-[-0.02em] text-teal-800">🎤 语音助手</h2>
              <p className="text-[10px] text-teal-600 mt-0.5">本地 Qwen3.6-35B，麦克风对话，自动朗读回答</p>
            </div>
            <Link
              href="/voice"
              className="flex-shrink-0 w-11 h-11 rounded-full bg-teal-500 text-white flex items-center justify-center text-xl shadow-md hover:bg-teal-600 transition-colors"
            >
              🎙
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Bottom Section ──────────────────────────────────────────────────────────
function BottomSection({ todayDate, integratedRepos }: { todayDate: string; integratedRepos: IntegratedRepo[] }) {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/news').then(r => r.json()).catch(() => ({ articles: [] }))
      .then(n => { setNews(n.items ?? n.articles ?? []); setLoading(false); });
  }, [todayDate]);

  if (loading) {
    return (
      <section>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="animate-pulse rounded-2xl bg-stone-100 h-48" />
          <div className="animate-pulse rounded-2xl bg-stone-100 h-48" />
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* 已整合仓库 和 新闻 - 并排两列 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 已整合仓库 */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
            <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">🧩 已整合仓库</h2>
            {integratedRepos.length > 0 ? (
              <div className="mt-3 space-y-2">
                {integratedRepos.slice(0, 6).map(repo => (
                  <Link
                    key={repo.safeName}
                    href={`/${repo.safeName}`}
                    className="group flex items-center justify-between rounded-xl p-2 transition hover:bg-teal-50/60"
                  >
                    <span className="text-xs font-semibold text-stone-700 group-hover:text-teal-700 line-clamp-1">
                      {repo.name}
                    </span>
                    <span className="text-[10px] text-teal-600 font-medium">访问 →</span>
                  </Link>
                ))}
                {integratedRepos.length > 6 && (
                  <p className="text-[10px] text-stone-400">还有 {integratedRepos.length - 6} 个...</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-stone-400">点击热门仓库 → 🤖 让 AI 整合</p>
            )}
          </div>
        </div>

        {/* News */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">📰 新闻</h2>
              <Link href="/news" className="text-[10px] font-bold text-teal-700 hover:underline">更多 →</Link>
            </div>
            {news.length > 0 ? (
              <div className="mt-3 space-y-2">
                {news.slice(0, 5).map((item, idx) => (
                  <Link key={idx} href={item.link || '#'} target="_blank" className="group flex items-start gap-2 rounded-xl p-1.5 transition hover:bg-white/50">
                    <span className="mb-1.5 text-[11px] font-bold text-teal-700">{item.source}</span>
                    <span className="line-clamp-2 text-xs font-semibold leading-snug text-stone-700 transition group-hover:text-[#173f3c]">
                      {item.translated_title || item.title || ''}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-stone-400">暂无新闻</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Main Dashboard Component ────────────────────────────────────────────────
interface DashboardInitialData {
  todayDate: string;
  todayTasks: Task[];
  allTasks: Task[];
  integratedRepos: IntegratedRepo[];
}

export default function DashboardPage({ initialData }: { initialData: DashboardInitialData }) {
  const todayDate = initialData.todayDate;

  return (
    <div className="bg-gradient-to-b from-teal-50/40 via-white to-stone-50/40 p-3 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-black tracking-[-0.04em] text-stone-900 sm:text-3xl">
            {getGreeting(new Date().getHours())}
          </h1>
          <p className="mt-0.5 text-xs text-stone-500">
            {todayDate} · 星期{['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()]}
          </p>
        </div>

        <TopSection
          todayDate={todayDate}
          initialTasks={initialData.allTasks}
          integratedRepos={initialData.integratedRepos}
        />

        <div className="mt-6">
          <BottomSection todayDate={todayDate} integratedRepos={initialData.integratedRepos} />
        </div>
      </div>
    </div>
  );
}