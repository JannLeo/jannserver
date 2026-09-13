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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* 请求数 */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 p-4 text-white shadow-lg shadow-teal-200/50">
        <p className="text-xs font-bold text-teal-100 tracking-wide">今日请求</p>
        <p className="mt-2 text-3xl font-black tracking-tighter">{summary.requestCountToday ?? '-'}</p>
        <p className="mt-1 text-[10px] text-teal-200">次</p>
      </div>

      {/* 今日花费 */}
      <div className="rounded-2xl bg-white border border-stone-200/60 p-4 shadow-sm">
        <p className="text-xs font-bold text-stone-500 tracking-wide">今日花费</p>
        <p className="mt-2 text-2xl font-black text-stone-900 tracking-tight">{f(summary.usedToday)}</p>
        <p className="mt-1 text-[10px] text-stone-400">Token {(summary.tokenCountToday || 0).toLocaleString()}</p>
      </div>

      {/* 7天花费 */}
      <div className="rounded-2xl bg-white border border-stone-200/60 p-4 shadow-sm">
        <p className="text-xs font-bold text-stone-500 tracking-wide">近7天</p>
        <p className="mt-2 text-2xl font-black text-stone-900 tracking-tight">{f(summary.used7d)}</p>
        <p className="mt-1 text-[10px] text-stone-400">累计</p>
      </div>

      {/* 余额 */}
      {summary.balance != null && (
        <div className="rounded-2xl bg-white border border-stone-200/60 p-4 shadow-sm">
          <p className="text-xs font-bold text-stone-500 tracking-wide">余额</p>
          <p className="mt-2 text-2xl font-black text-emerald-600 tracking-tight">{fmtBalance(summary.balance)}</p>
          <p className="mt-1 text-[10px] text-stone-400">储备</p>
        </div>
      )}
    </div>
  );
}

// ─── Daily Summary Section ───────────────────────────────────────────────────
/**
 * Extracts the AI summary content from the full daily markdown.
 *
 * Stops at the FIRST occurrence of any of these to avoid capturing
 * template sections or duplicate headers:
 *   - \n#   (any h1 heading — template has `# YYYY-MM-DD`)
 *   - \n##  (any h2 heading — template has `## 今日重点` etc.)
 *   - \n--- (markdown horizontal rule separating AI summary from template)
 *   - end of string
 */
const AI_SUMMARY_RE = /## AI 总结[\s\S]*?(?=\n# |\n---|\n## |$)/;

function extractSummary(text: string): string | null {
  const match = text.match(AI_SUMMARY_RE);
  if (match) {
    // Trim the "## AI 总结" header, and any trailing horizontal rules or blank lines
    return match[0]
      .replace(/^## AI 总结\s*\n?/, '')
      .replace(/\n---\s*$/, '')
      .replace(/\n# \d{4}-\d{2}-\d{2}\s*$/, '')
      .trim();
  }
  return null;
}

function DailySummarySection({ todayDate }: { todayDate: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const autoTriggeredRef = useRef(false);

  useEffect(() => {
    // 使用多 Agent API
    fetch(`/api/ai/daily-summary/multiagent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayDate }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.summary) {
          setSummary(d.summary);
          setLoading(false);
        } else {
          setLoading(false);
          // 如果多 Agent 失败，fallback 到旧 API
          if (!autoTriggeredRef.current) {
            fallbackToOldApi(todayDate);
          }
        }
      })
      .catch(() => {
        setLoading(false);
        if (!autoTriggeredRef.current) {
          fallbackToOldApi(todayDate);
        }
      });
  }, [todayDate]);

  const fallbackToOldApi = (date: string) => {
    autoTriggeredRef.current = true;
    setGenerating(true);
    fetch('/api/ai/daily-summary/generate-and-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
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
  };

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

  if (loading) return (
    <div className="space-y-2">
      <div className="animate-pulse h-5 bg-teal-100/50 rounded-lg w-3/4" />
      <div className="animate-pulse h-5 bg-teal-100/50 rounded-lg w-1/2" />
      <div className="animate-pulse h-5 bg-teal-100/50 rounded-lg w-2/3" />
    </div>
  );

  const generatingIndicator = generating && (
    <div className="flex items-center gap-2 text-sm text-teal-600 mb-3">
      <span className="inline-block w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      正在生成日总结…
    </div>
  );

  return (
    <div>
      {summary ? (
        <div>
          {generatingIndicator}
          <div className="prose prose-sm max-w-none">
            {summary.split('\n').map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <br key={i} />;
              // 检测是否是列表项
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={i} className="flex gap-2.5 mb-2.5">
                    <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                    <span className="text-base font-semibold leading-relaxed text-stone-800">{trimmed.slice(2)}</span>
                  </div>
                );
              }
              // 检测是否是数字列表
              if (/^\d+\.\s/.test(trimmed)) {
                return (
                  <div key={i} className="flex gap-2 mb-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
                      {trimmed.match(/^(\d+)\./)?.[1]}
                    </span>
                    <span className="text-base font-semibold leading-relaxed text-stone-800">{trimmed.replace(/^\d+\.\s/, '')}</span>
                  </div>
                );
              }
              // 如果是标题行（以 ## 开头）
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={i} className="text-base font-black text-teal-800 mb-2 mt-3">{trimmed.replace(/^##\s*/, '')}</h3>
                );
              }
              // 普通段落
              return (
                <p key={i} className="text-base font-semibold leading-relaxed text-stone-800 mb-2.5">{trimmed}</p>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Link href={`/daily/${todayDate}`} className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:text-teal-800 transition-colors">
              查看完整日报
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs font-bold text-stone-400 hover:text-teal-600 transition-colors disabled:opacity-50"
            >
              重新生成
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 mb-3">
            <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-sm text-stone-500 mb-3">今天还没有日总结</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-teal-600 text-white text-sm font-bold shadow-md shadow-teal-200/50 hover:bg-teal-700 hover:shadow-lg hover:shadow-teal-200/50 transition-all disabled:opacity-50 active:scale-95"
          >
            {generating ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <span>✨</span>
                生成 AI 日总结
              </>
            )}
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
      // 使用多 Agent API
      const res = await fetch('/api/ai/ask-multiagent', {
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
        <div className="mt-2">
          <div className="p-3 rounded-2xl bg-white/60 border border-stone-200 text-sm text-stone-700 leading-relaxed max-h-40 overflow-y-auto">
            {answer}
          </div>
          <Link href="/ask" className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-teal-600 hover:text-teal-800 transition-colors">
            去完整问答页面 →
          </Link>
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
function TopSection({ todayDate }: { todayDate: string }) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/usage').then(r => r.json()).catch(() => null),
      fetch('/api/tasks?limit=50').then(r => r.json()).catch(() => ({ tasks: [] })),
    ]).then(([u, t]) => {
      if (u && u.ok) setUsage(u);
      const taskList: Task[] = t.tasks ?? [];
      setTasks(taskList);
    });
  }, [todayDate]);

  return (
    <section>
      <div className="mb-6">
        <UsageSection summary={usage} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Daily Summary */}
        <div className="rounded-2xl border border-stone-900/10 bg-gradient-to-br from-teal-50/80 to-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h2 className="text-sm font-black tracking-[-0.02em] text-teal-800">AI 日总结</h2>
          </div>
          <DailySummarySection todayDate={todayDate} />
        </div>

        {/* Today's Questions */}
        <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
          <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900 mb-3">💬 向知识库提问</h2>
          <AskSection todayDate={todayDate} />
        </div>

        {/* Overview */}
        <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
          <OverviewSection tasks={tasks} />
        </div>
      </div>
    </section>
  );
}

// ─── Bottom Section ──────────────────────────────────────────────────────────
function BottomSection({ todayDate }: { todayDate: string }) {
  const [repos, setRepos] = useState<RepoStat[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/repos').then(r => r.json()).catch(() => ({ repos: [] })),
      fetch('/api/news').then(r => r.json()).catch(() => ({ articles: [] })),
    ]).then(([r, n]) => {
      setRepos(r.repos ?? []);
      setNews(n.articles ?? []);
      setLoading(false);
    });
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

  const syncRepos = repos.filter(r => r.lastSyncAt);
  const unsyncRepos = repos.filter(r => !r.lastSyncAt);

  return (
    <section>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Inbox / New Notes */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-stone-900/10 bg-white/55 p-4 shadow-sm">
            <h2 className="text-sm font-black tracking-[-0.02em] text-stone-900">Repos</h2>
            {syncRepos.length > 0 ? (
              <div className="mt-3 space-y-2">
                {syncRepos.slice(0, 4).map(repo => (
                  <div key={repo.id} className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-700">{repo.name}</span>
                    <span className="text-[10px] text-stone-400">{repo.documentCount} 文档</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-stone-400">还没有同步仓库</p>
            )}
            {unsyncRepos.length > 0 && (
              <p className="mt-2 text-[10px] text-amber-600">{unsyncRepos.length} 个仓库未同步</p>
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

        <div className="mt-6">
          <BottomSection todayDate={todayDate} />
        </div>
      </div>
    </div>
  );
}