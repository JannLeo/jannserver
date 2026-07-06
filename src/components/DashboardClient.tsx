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

interface RepoStat {
  id: number;
  name: string;
  lastSyncAt: string | null;
  documentCount: number;
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

interface ActivityData {
  repos: any[];
  totalCommits: number;
}

interface DashboardData {
  todayDate: string;
  todayTasks: Task[];
  undoneTasks: Task[];
  repos: RepoStat[];
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
// AI summary ends at the `---` separator inserted by generate-and-save
const AI_SUMMARY_RE = /## AI 总结[\s\S]*?(?=\n---|$)/;

function extractSummary(text: string): string | null {
  const match = text.match(AI_SUMMARY_RE);
  if (match) return match[0].replace(/^## AI 总结\n?/, '').trim();
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
        headers: { 'Content-Type': 'application/json' },
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

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function DashboardClient({ data, activity, usageSummary }: { data: DashboardData; activity: ActivityData; usageSummary: UsageSummary | null }) {
  const { todayDate, todayTasks } = data;
  const { totalCommits: totalCommitsToday } = activity;
  const [tasks, setTasks] = useState<Task[]>(todayTasks);
  const [toggling, setToggling] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<{title: string; link: string; source: string; pubDate: string}[]>([]);

  const greeting = getGreeting(new Date().getHours());
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done');

  const toggleTask = async (id: string, cur: string) => {
    const ns = cur === 'done' ? 'todo' : 'done';
    setToggling(id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: ns, completedAt: ns === 'done' ? new Date().toISOString() : null } : t));
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: ns }) });
      if (!res.ok) setTasks(prev => prev.map(t => t.id === id ? { ...t, status: cur } : t));
    } catch { setTasks(prev => prev.map(t => t.id === id ? { ...t, status: cur } : t)); }
    finally { setToggling(null); }
  };

const quickCreateItems = [
    { href: '/notes/new', icon: '✍️', label: '新建笔记', hint: '沉淀想法' },
    { href: '/memos?new=1', icon: '💡', label: '新建备忘', hint: '快速记录' },
    { href: '/tasks?new=1', icon: '✓', label: '新建任务', hint: '安排下一步' },
    { href: '/daily', icon: '☀️', label: '今日 Daily', hint: '复盘今天' },
  ];

  useEffect(() => {
    fetch('/api/news?limit=6')
      .then(r => r.json())
      .then(d => setNewsItems(d.items ?? []))
      .catch(() => {});
  }, []);
  return (
    <div className="relative mx-auto min-h-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute right-8 top-8 hidden h-48 w-48 rounded-full bg-teal-300/20 blur-3xl lg:block" />

{/* 📰 新闻快讯（最上方） */}
      {newsItems.length > 0 && (
        <section className="surface-card overflow-hidden rounded-[1.75rem]">
          <div className="flex items-center justify-between border-b border-stone-900/10 px-5 py-3.5 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-blue-100 px-2 py-1 text-[11px] font-black text-blue-700">📰 快讯</span>
              <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">全球新闻</h2>
            </div>
            <Link href="/news" className="rounded-full border border-stone-900/10 bg-white/55 px-3 py-1 text-xs font-black text-stone-600 transition hover:border-teal-500/40 hover:text-teal-700">更多 →</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto p-4 sm:p-5 scrollbar-hide">
            {newsItems.map((item, idx) => (
              <a
                key={idx}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-[220px] max-w-[260px] flex-shrink-0 flex-col rounded-2xl border border-stone-900/10 bg-white/55 p-3.5 transition hover:border-teal-500/30 hover:shadow-sm"
              >
                <span className="mb-1.5 text-[11px] font-bold text-teal-700">{item.source}</span>
                <span className="line-clamp-2 text-xs font-semibold leading-snug text-stone-700 transition group-hover:text-[#173f3c]">
                  {item.title}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ====== 顶部横幅 ====== */}
      <section className="surface-card relative overflow-hidden rounded-[2rem] p-5 sm:p-7 lg:p-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-300/28 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-kicker">{todayDate}</p>
            <h1 className="mt-2 text-3xl font-black leading-[0.98] tracking-[-0.06em] text-stone-950 sm:text-4xl lg:text-5xl">
              {greeting}，<span className="text-teal-700">把今天的系统跑顺。</span>
            </h1>
            <p className="mt-4 text-sm text-stone-600 font-semibold">
              今日待办 <span className="text-teal-700">{todoTasks.length + inProgressTasks.length}</span> · 已完成 <span className="text-emerald-700">{doneTasks.length}</span> · 代码热度 <span className="text-stone-900">{totalCommitsToday}</span> 次提交
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/tasks" className="px-4 py-2 rounded-full border border-stone-200 bg-white/50 text-xs font-bold text-stone-600 hover:border-teal-400 hover:text-teal-700 transition">全部任务 →</Link>
            <Link href="/notes/new" className="px-4 py-2 rounded-full bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 transition">✍️ 新笔记</Link>
          </div>
        </div>
      </section>

      {/* ====== AI 问答（置顶） ====== */}
      <section className="surface-card rounded-[1.75rem] p-5 sm:p-6 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🤖</span>
          <div>
            <p className="section-kicker">Knowledge search</p>
            <h2 className="text-lg font-black tracking-[-0.03em] text-stone-900">AI 问答</h2>
          </div>
        </div>
        <AskSection todayDate={todayDate} />
      </section>

{/* ====== 四宫格 ====== */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">

        {/* ── 左列：今日任务 ── */}
        <section className="surface-card overflow-hidden rounded-[1.75rem]">
          <div className="border-b border-stone-900/10 px-5 py-4 sm:px-6">
            <p className="section-kicker">Focus queue</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-stone-900">今日要干的活</h2>
          </div>
          <div className="p-4 sm:p-5">
            {tasks.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-stone-300 bg-white/40 py-12 text-center">
                <p className="text-5xl">🎉</p>
                <p className="mt-3 text-sm font-bold text-stone-500">今天没事干，休息一下吧。</p>
                <Link href="/tasks?new=1" className="mt-5 inline-flex rounded-full bg-[#173f3c] px-5 py-2.5 text-sm font-black text-amber-50 shadow-lg shadow-teal-900/10 transition hover:-translate-y-0.5">
                  安排新任务
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {inProgressTasks.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-amber-700">进行中 ({inProgressTasks.length})</h3>
                    <div className="space-y-2">{inProgressTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />)}</div>
                  </div>
                )}
                {todoTasks.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-stone-500">待办 ({todoTasks.length})</h3>
                    <div className="space-y-2">{todoTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />)}</div>
                  </div>
                )}
                {doneTasks.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">已完成 ({doneTasks.length})</h3>
                    <div className="space-y-2">{doneTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── 右列 ── */}
        <div className="space-y-5">

{/* AI 日总结 */}
          <section className="surface-card rounded-[1.75rem] p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-kicker">AI summary</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-stone-900">AI 日总结</h2>
              </div>
              <Link href={`/daily/${todayDate}`} className="text-xs font-bold text-teal-700 hover:underline">编辑 →</Link>
            </div>
            <DailySummarySection todayDate={todayDate} />
          </section>

          {/* API 使用量 */}
          <section className="surface-card rounded-[1.75rem] p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-kicker">Resource monitor</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-stone-900">用量</h2>
              </div>
            </div>
            <UsageSection summary={usageSummary} />
          </section>

        </div>
      </div>
    </div>
  );
}