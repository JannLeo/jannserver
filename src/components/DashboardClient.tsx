'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduledDate?: string | null;
  completedAt?: string | null;
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
        <span>今日 <strong className="text-stone-800">{summary.requestCountToday ?? '-'} 请求</strong></span>
        <span>花费 <strong className="text-stone-800">{f(summary.usedToday)}</strong></span>
        <span>Token <strong className="text-stone-800">{(summary.tokenCountToday || 0).toLocaleString()}</strong></span>
        {summary.balance != null && (
          <span className="flex-shrink-0">余额 <strong className="text-emerald-700">{fmtBalance(summary.balance)}</strong></span>
        )}
      </div>
    </div>
  );
}

// ─── Daily Summary Section ───────────────────────────────────────────────────
/**
 * Extracts the AI summary content from the full daily markdown.
 *
 * Two possible formats:
 * 1. Old: "## AI 总结\n\n..." ending at --- or ## or end
 * 2. New: AI output stored directly; strip the "## AI 总结" line itself
 *    (the h1 heading that follows is the start of the AI report content)
 */
const AI_SUMMARY_RE = /## AI 总结[\s\S]*?(?=\n## |\n---|\n# [A-Z]|$)/;

function extractSummary(text: string): string | null {
  // Format 1: has ## AI 总结 header
  const match = text.match(AI_SUMMARY_RE);
  if (match) {
    const raw = match[0]
      .replace(/^## AI 总结\s*\n?/, '')
      .replace(/\n---\s*$/, '')
      .trim();
    if (raw.length > 0) return raw;
  }

  // Format 2: strip the first h1 header (AI 总结 marker line) and return everything else
  // The "## AI 总结" section contains an h1 like "# YYYY-MM-DD 工作日报"
  // which is the start of the actual AI content — remove the AI总结 section header only
  const withoutMarker = text.replace(/^## AI 总结\n+/, '');
  const cleaned = withoutMarker
    .replace(/^# \d{4}-\d{2}-\d{2}[^\n]*\n?/, '') // remove first h1 "# YYYY-MM-DD ...\n"
    .trim();
  if (cleaned.length > 0) {
    return cleaned.length > 500 ? cleaned.slice(0, 500) + '…' : cleaned;
  }

  return null;
}

function DailySummarySection({ todayDate }: { todayDate: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const autoTriggeredRef = useRef(false);

  useEffect(() => {
    fetch(`/api/daily/${todayDate}`)
      .then(r => r.json())
      .then(d => {
        const text = d.content || d.rawContent || '';
        const extracted = extractSummary(text);
        if (extracted) {
          setSummary(extracted);
          setLoading(false);
        } else {
          setLoading(false);
          // 没有 AI 总结 → 自动生成并保存
          if (!autoTriggeredRef.current) {
            autoTriggeredRef.current = true;
            setGenerating(true);
            fetch('/api/ai/daily-summary/generate-and-save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date: todayDate }),
            })
              .then(r => r.json())
              .then(data => {
                if (data.content) {
                  const extracted = extractSummary(data.content);
                  if (extracted) setSummary(extracted);
                }
              })
              .catch(() => {})
              .finally(() => setGenerating(false));
          }
        }
      })
      .catch(() => {
        setLoading(false);
        // 网络错误也自动生成
        if (!autoTriggeredRef.current) {
          autoTriggeredRef.current = true;
          setGenerating(true);
          fetch('/api/ai/daily-summary/generate-and-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: todayDate }),
          })
            .then(r => r.json())
            .then(data => {
              if (data.content) {
                const extracted = extractSummary(data.content);
                if (extracted) setSummary(extracted);
              }
            })
            .catch(() => {})
            .finally(() => setGenerating(false));
        }
      });
  }, [todayDate]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/daily-summary/generate-and-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-regenerate': 'true' },
        body: JSON.stringify({ date: todayDate }),
      });
      const data = await res.json();
      if (data.content) {
        const extracted = extractSummary(data.content);
        if (extracted) setSummary(extracted);
      }
    } catch {}
    setGenerating(false);
  };

  if (loading) return <div className="animate-pulse h-16 bg-stone-100 rounded-2xl" />;

  const generatingIndicator = generating && (
    <div className="flex items-center gap-2 text-xs text-stone-400 mb-2">
      <span className="inline-block w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      正在生成日总结…
    </div>
  );

  return (
    <div>
      {summary ? (
        <div>
          {generatingIndicator}
          <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{summary}</p>
          <Link href={`/daily/${todayDate}`} className="mt-2 inline-block text-xs font-bold text-teal-700 hover:underline">
            查看完整日报 →
          </Link>
        </div>
      ) : (
        <div className="text-center py-3">
          <p className="text-sm text-stone-400">今天还没有日总结</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-2 px-4 py-1.5 rounded-full bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 disabled:opacity-50"
          >
            {generating ? '生成中…' : '🤖 生成日总结'}
          </button>
        </div>
      )}
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
          {answer}
        </div>
      )}
    </div>
  );
}

// ─── Overview Section ────────────────────────────────────────────────────────
function OverviewSection({ tasks, todayDate }: { tasks: Task[]; todayDate: string }) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/task-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks }),
      });
      const data = await res.json();
      if (data.analysis) setAnalysis(data.analysis);
    } catch {}
    setAnalyzing(false);
  };

  useEffect(() => {
    if (tasks.length > 0 && !analysis) runAnalysis();
  }, [todayDate]);

  const doneCount = tasks.filter(t => t.status === 'done').length;
  const highPriority = tasks.filter(t => t.priority === 'high' && t.status !== 'done');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">今日任务</h2>
        <span className="text-xs font-bold text-stone-500">{doneCount}/{tasks.length}</span>
      </div>
      {tasks.length > 0 ? (
        <div className="space-y-1.5">
          {tasks.slice(0, 4).map(task => (
            <div key={task.id} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${task.status === 'done' ? 'bg-teal-500' : task.priority === 'high' ? 'bg-red-400' : 'bg-stone-300'}`} />
              <span className={`text-xs ${task.status === 'done' ? 'line-through text-stone-400' : 'text-stone-700'}`}>{task.title}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/30 p-4 text-center">
          <p className="text-xs text-stone-500">今天还没有任务</p>
          <Link href="/tasks" className="mt-1 inline-block text-xs font-bold text-teal-700 hover:underline">去创建 →</Link>
        </div>
      )}

      {/* AI Task Analysis */}
      {highPriority.length > 0 && (
        <div className="mt-2">
          {analyzing ? (
            <p className="text-[10px] text-teal-600 animate-pulse">🤖 AI 分析中…</p>
          ) : analysis ? (
            <div className="mt-1 p-2 rounded-xl bg-teal-50/60 border border-teal-200/60">
              <p className="text-[10px] font-bold text-teal-700 mb-0.5">🤖 AI 优先级建议</p>
              <p className="text-[10px] text-stone-600 leading-relaxed">{analysis}</p>
            </div>
          ) : (
            <button onClick={runAnalysis} className="mt-1 text-[10px] font-bold text-teal-600 hover:underline">
              🤖 AI 分析优先级
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Trending Section ────────────────────────────────────────────────────────
function TrendingSection() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/trending')
      .then(r => r.json())
      .then(d => { setItems(d.repos ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-32 rounded-2xl bg-stone-100" />;
  if (items.length === 0) return <p className="text-xs text-stone-400">暂无趋势</p>;

  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((item: any, idx: number) => (
        <div key={idx} className="flex items-start gap-2">
          <span className="text-[10px] font-black text-stone-400 w-4">{idx + 1}</span>
          <a
            href={`https://github.com${item.href}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-stone-700 hover:text-[#173f3c] line-clamp-2 leading-snug"
          >
            <span className="text-teal-700">{item.name?.split('/')[1]}</span>
            {' '}<span className="font-normal">{item.description || '无描述'}</span>
          </a>
        </div>
      ))}
    </div>
  );
}

// ─── Top Section ─────────────────────────────────────────────────────────────
function TopSection({ todayDate }: { todayDate: string }) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [undoneTasks, setUndoneTasks] = useState<Task[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/usage').then(r => r.json()).catch(() => null),
      fetch('/api/tasks?limit=50').then(r => r.json()).catch(() => ({ tasks: [] })),
    ]).then(([u, t]) => {
      if (u && u.ok) setUsage(u);
      const taskList: Task[] = Array.isArray(t) ? t : (t?.tasks ?? []);
      setTasks(taskList);
      setUndoneTasks(taskList.filter((tk: Task) => tk.status !== 'done'));
    });
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
      <div className="mb-6">
        <UsageSection summary={usage} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Daily Summary */}
        <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
          <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">AI 日总结</h2>
          <DailySummarySection todayDate={todayDate} />
        </div>

        {/* Overview with AI Task Analysis */}
        <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
          <OverviewSection tasks={tasks} todayDate={todayDate} />
        </div>
      </div>

      
    </section>
  );
}

// ─── Bottom Section ──────────────────────────────────────────────────────────
function BottomSection({ todayDate }: { todayDate: string }) {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(n => { setNews(n.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
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
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Trending */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">📈 趋势</h2>
              <Link href="/trending" className="text-[10px] font-bold text-teal-700 hover:underline">更多 →</Link>
            </div>
            <div className="mt-3">
              <TrendingSection />
            </div>
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
}

export default function DashboardPage({ initialData }: { initialData: DashboardInitialData }) {
  const todayDate = initialData.todayDate;

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50/40 via-white to-stone-50/40 p-3 sm:p-6 lg:p-8">
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

        <TopSection todayDate={todayDate} />

        {/* Full-width Ask Section */}
        <div className="mt-6 rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
          <AskSection todayDate={todayDate} />
        </div>

        <div className="mt-6">
          <BottomSection todayDate={todayDate} />
        </div>
      </div>
    </div>
  );
}