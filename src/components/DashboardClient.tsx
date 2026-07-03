'use client';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduledDate?: string | null;
  completedAt?: string | null;
}

interface Note {
  id: string;
  title: string;
  slug: string;
  updatedAt: string;
}

interface Memo {
  id: string;
  slug: string;
  excerpt: string;
  updatedAt: string;
}

interface RepoStat {
  id: number;
  name: string;
  lastSyncAt: string | null;
  documentCount: number;
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  changedFiles: string[];
  changedFileCount: number;
}

interface RepoActivity {
  repoId: number;
  repoName: string;
  commits: CommitInfo[];
}

interface ActivityData {
  repos: RepoActivity[];
  totalCommits: number;
}

interface DashboardData {
  todayDate: string;
  todayTasks: Task[];
  undoneTasks: Task[];
  recentNotes: Note[];
  recentMemos: Memo[];
  repos: RepoStat[];
}

function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function formatTime(iso: string): string {
  try { return format(new Date(iso), 'MM-dd HH:mm'); } catch { return ''; }
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return '从未同步';
  try { return format(new Date(iso), 'MM-dd HH:mm'); } catch { return '从未同步'; }
}

interface Source {
  title?: string;
}

interface AskResult {
  answer?: string;
  sources?: Source[];
  configured: boolean;
  usedKnowledgeBase?: boolean;
  error?: string;
}

function TaskItem({ task, onToggle, toggling }: {
  task: Task;
  onToggle: (id: string, status: string) => void;
  toggling: boolean;
}) {
  const isDone = task.status === 'done';
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition">
      <button
        onClick={() => onToggle(task.id, task.status)}
        disabled={toggling}
        aria-label={isDone ? '标记为未完成' : '标记为已完成'}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition flex-shrink-0 ${
          isDone
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-slate-300 hover:border-blue-400'
        } ${toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {isDone && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span className={`text-sm flex-1 ${isDone ? 'line-through text-slate-400' : 'text-slate-700'}`}>
        {task.title}
      </span>
      {task.priority === 'high' && !isDone && (
        <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded border border-red-200">高</span>
      )}
    </div>
  );
}

export default function DashboardClient({ data, activity }: { data: DashboardData; activity: ActivityData }) {
  const { todayDate, undoneTasks, recentNotes, recentMemos, repos } = data;
  const { repos: activityRepos, totalCommits: totalCommitsToday } = activity;
  const [tasks, setTasks] = useState<Task[]>(data.todayTasks);
  const [toggling, setToggling] = useState<string | null>(null);

  const [question, setQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AskResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI 日报
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryMarkdown, setSummaryMarkdown] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // new-api 使用情况
  const [usageData, setUsageData] = useState<any | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);

  // AI 日计划（独立状态，不与日报互相覆盖）
  const [planLoading, setPlanLoading] = useState(false);
  const [planMarkdown, setPlanMarkdown] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planCopied, setPlanCopied] = useState(false);
  const [planUserHint, setPlanUserHint] = useState('');
  const [suggestedTasks, setSuggestedTasks] = useState<Array<{
    title: string;
    priority: string;
    projectName: string;
    reason: string;
  }>>([]);
  const [selectedTaskIdx, setSelectedTaskIdx] = useState<Set<number>>(new Set());
  const [creatingTasks, setCreatingTasks] = useState(false);

  const hour = new Date().getHours();
  const greeting = getGreeting(hour);

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done');
  const todayCompleted = doneTasks.length;
  const todayTodo = todoTasks.length + inProgressTasks.length;

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';
    setToggling(taskId);
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: newStatus, completedAt: newStatus === 'done' ? new Date().toISOString() : null }
        : t
    ));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: currentStatus } : t));
      }
    } catch {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: currentStatus } : t));
    } finally {
      setToggling(null);
    }
  };

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (result.configured === false) {
          setAiError(result.error || 'AI 未配置');
        } else {
          setAiError(result.error || `请求失败 (${res.status})`);
        }
        return;
      }
      setAiResult(result);
    } catch (err) {
      setAiError(`网络错误: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiLoading(false);
    }
  }, [question]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  // 加载 new-api 使用情况（失败不阻塞 Dashboard）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUsageLoading(true);
      try {
        const res = await fetch('/api/new-api/usage?range=7d');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setUsageData(data);
        }
      } catch (e) {
        // 静默失败，不阻塞页面
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 生成工作日报
  const handleGenerateSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryMarkdown(null);
    setSummaryCopied(false);
    try {
      const res = await fetch('/api/ai/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.configured === false) {
          setSummaryError(data.error || 'AI 未配置');
        } else {
          setSummaryError(data.error || `请求失败 (${res.status})`);
        }
        return;
      }
      if (data.markdown) {
        setSummaryMarkdown(data.markdown);
      } else {
        setSummaryError('AI 返回为空');
      }
    } catch (err) {
      setSummaryError(`网络错误: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSummaryLoading(false);
    }
  }, [todayDate]);

  // 复制 Markdown
  const handleCopySummary = useCallback(async () => {
    if (!summaryMarkdown) return;
    try {
      await navigator.clipboard.writeText(summaryMarkdown);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [summaryMarkdown]);

  // 追加到今日 Daily
  const handleAppendToDaily = useCallback(async () => {
    if (!summaryMarkdown) return;
    try {
      // 1. 获取当前 Daily 内容
      const getRes = await fetch(`/api/daily/${todayDate}`);
      if (!getRes.ok) {
        setSummaryError('获取 Daily 失败');
        return;
      }
      const dailyData = await getRes.json();
      const currentContent = dailyData.content || '';

      // 2. 追加 Markdown 草稿
      const newContent = currentContent
        ? `${currentContent}\n\n---\n\n${summaryMarkdown}`
        : summaryMarkdown;

      const putRes = await fetch(`/api/daily/${todayDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });

      if (!putRes.ok) {
        setSummaryError('追加 Daily 失败');
        return;
      }
      setSummaryError(null);
      setSummaryMarkdown(null);
      alert('已追加到今日 Daily');
    } catch (err) {
      setSummaryError(`追加失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [summaryMarkdown, todayDate]);

  // 生成今日计划
  const handleGeneratePlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    setPlanMarkdown(null);
    setPlanCopied(false);
    setSuggestedTasks([]);
    setSelectedTaskIdx(new Set());
    try {
      const res = await fetch('/api/ai/daily-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayDate, userHint: planUserHint.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.configured === false) {
          setPlanError(data.error || 'AI 未配置');
        } else {
          setPlanError(data.error || `请求失败 (${res.status})`);
        }
        return;
      }
      if (data.markdown) {
        setPlanMarkdown(data.markdown);
      } else {
        setPlanError('AI 返回为空');
      }
      if (Array.isArray(data.suggestedTasks)) {
        setSuggestedTasks(data.suggestedTasks);
      }
    } catch (err) {
      setPlanError(`网络错误: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPlanLoading(false);
    }
  }, [todayDate, planUserHint]);

  // 复制日计划 Markdown
  const handleCopyPlan = useCallback(async () => {
    if (!planMarkdown) return;
    try {
      await navigator.clipboard.writeText(planMarkdown);
      setPlanCopied(true);
      setTimeout(() => setPlanCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [planMarkdown]);

  // 追加日计划到今日 Daily
  const handleAppendPlanToDaily = useCallback(async () => {
    if (!planMarkdown) return;
    try {
      const getRes = await fetch(`/api/daily/${todayDate}`);
      if (!getRes.ok) {
        setPlanError('获取 Daily 失败');
        return;
      }
      const dailyData = await getRes.json();
      const currentContent = dailyData.content || '';
      const newContent = currentContent
        ? `${currentContent}\n\n---\n\n${planMarkdown}`
        : planMarkdown;
      const putRes = await fetch(`/api/daily/${todayDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      if (!putRes.ok) {
        setPlanError('追加 Daily 失败');
        return;
      }
      setPlanError(null);
      setPlanMarkdown(null);
      alert('已追加到今日 Daily');
    } catch (err) {
      setPlanError(`追加失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [planMarkdown, todayDate]);

  // 切换建议任务选中
  const toggleTaskSelection = (idx: number) => {
    setSelectedTaskIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // 创建选中的建议任务
  const handleCreateSelectedTasks = useCallback(async () => {
    const toCreate = Array.from(selectedTaskIdx).map(i => suggestedTasks[i]).filter(Boolean);
    if (toCreate.length === 0) return;
    setCreatingTasks(true);
    try {
      for (const t of toCreate) {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: t.title,
            priority: t.priority,
            scheduledDate: todayDate,
          }),
        });
      }
      alert(`已创建 ${toCreate.length} 个任务`);
      setSelectedTaskIdx(new Set());
    } catch (err) {
      setPlanError(`创建任务失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreatingTasks(false);
    }
  }, [selectedTaskIdx, suggestedTasks, todayDate]);

  const quickCreateItems = [
    { href: '/notes/new', icon: '📝', label: '新建笔记' },
    { href: '/memos?new=1', icon: '💡', label: '新建备忘' },
    { href: '/tasks?new=1', icon: '✅', label: '新建任务' },
    { href: '/daily', icon: '📅', label: '今日 Daily' },
    { href: '/projects?new=1', icon: '📁', label: '新建项目' },
    { href: '/ask', icon: '🤖', label: 'AI 问答' },
  ];

  return (
    <div className="h-full max-w-5xl mx-auto p-6">
      {/* 顶部问候 */}
      <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 sm:p-6 border border-blue-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
              {greeting} 👋
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              今天是 <span className="font-medium">{todayDate}</span>
              {todayTodo > 0 && (
                <>，你有 <span className="font-semibold text-blue-600">{todayTodo}</span> 个待办</>
              )}
              {todayCompleted > 0 && (
                <>，<span className="font-semibold text-green-600">{todayCompleted}</span> 个已完成</>
              )}
              {todayTodo === 0 && todayCompleted === 0 && <>，暂无任务</>}
              {totalCommitsToday > 0 && (
                <>，GitHub 有 <span className="font-semibold text-indigo-600">{totalCommitsToday}</span> 次提交</>
              )}
              。
            </p>
          </div>
          <div className="flex gap-2 flex-wrap flex-shrink-0">
            <Link href="/ask" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition whitespace-nowrap">
              🤖 AI 问答
            </Link>
            <Link href="/daily" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition whitespace-nowrap">
              📅 今日 Daily
            </Link>
            <Link href="/repos" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition whitespace-nowrap">
              📚 知识库
            </Link>
          </div>
        </div>
      </div>

      {/* 主体布局：桌面 2:1，移动单列 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左列 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 今日工作区 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">📋 今日工作区</h2>
              <Link href="/tasks" className="text-xs text-slate-500 hover:text-blue-600 whitespace-nowrap">
                全部任务 →
              </Link>
            </div>
            <div className="p-5">
              {tasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-2">🎉</p>
                  <p className="text-sm text-slate-400">今日暂无任务</p>
                  <Link href="/tasks?new=1" className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                    创建任务
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {inProgressTasks.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-yellow-600 mb-2 uppercase tracking-wide">进行中</h3>
                      <div className="space-y-1">
                        {inProgressTasks.map(t => (
                          <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />
                        ))}
                      </div>
                    </div>
                  )}
                  {todoTasks.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">待办</h3>
                      <div className="space-y-1">
                        {todoTasks.map(t => (
                          <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />
                        ))}
                      </div>
                    </div>
                  )}
                  {doneTasks.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-green-600 mb-2 uppercase tracking-wide">已完成 ({doneTasks.length})</h3>
                      <div className="space-y-1">
                        {doneTasks.map(t => (
                          <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* AI 工作助手 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">🤖 AI 工作助手</h2>
            </div>
            <div className="p-5">
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="问知识库 anything..."
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition"
                  disabled={aiLoading}
                />
                <button
                  onClick={handleAsk}
                  disabled={aiLoading || !question.trim()}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
                >
                  {aiLoading ? '查询中...' : '提问'}
                </button>
              </div>
              {aiError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {aiError}
                </div>
              )}
              {aiLoading && (
                <div className="p-3 text-sm text-slate-400 animate-pulse">
                  正在搜索知识库并生成回答...
                </div>
              )}
              {aiResult && aiResult.configured && aiResult.answer && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiResult.answer}</div>
                  {aiResult.sources && aiResult.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-xs text-slate-400 mb-2">参考来源 ({aiResult.sources.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {aiResult.sources.map((s, i) => (
                          <span key={i} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
                            {s.title || '无标题'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* AI 快捷按钮 */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2 flex-wrap">
                <button
                  onClick={handleGenerateSummary}
                  disabled={summaryLoading}
                  className="px-3 py-1.5 text-xs text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {summaryLoading ? '⏳ 生成中...' : '📝 生成工作日报'}
                </button>
                <button
                  onClick={handleGeneratePlan}
                  disabled={planLoading}
                  className="px-3 py-1.5 text-xs text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {planLoading ? '⏳ 生成中...' : '📋 生成今日计划'}
                </button>
                <button
                  disabled
                  className="px-3 py-1.5 text-xs text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed"
                  title="后续阶段实现"
                >
                  📊 总结 GitHub 提交
                </button>
              </div>

              {/* 日计划 userHint 输入 */}
              {planLoading || planMarkdown || planError ? null : (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={planUserHint}
                    onChange={e => setPlanUserHint(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGeneratePlan(); } }}
                    placeholder="今日重点（可选）：例如 FPGA RX 测试"
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-400 focus:bg-white"
                    disabled={planLoading}
                  />
                </div>
              )}

              {/* 日计划错误 */}
              {planError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {planError}
                </div>
              )}

              {/* 日计划 loading */}
              {planLoading && (
                <div className="mt-3 p-3 text-sm text-slate-400 animate-pulse">
                  正在收集任务和最近记录，生成今日计划...
                </div>
              )}

              {/* 日计划结果 */}
              {planMarkdown && !planLoading && (
                <div className="mt-3 border border-green-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-green-50 border-b border-green-200 flex items-center justify-between">
                    <span className="text-xs font-medium text-green-700">日计划草稿</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleCopyPlan}
                        className="text-xs px-2 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50"
                      >
                        {planCopied ? '✓ 已复制' : '复制'}
                      </button>
                      <button
                        onClick={handleAppendPlanToDaily}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        追加到 Daily
                      </button>
                      <button
                        onClick={() => { setPlanMarkdown(null); setPlanError(null); setSuggestedTasks([]); setSelectedTaskIdx(new Set()); }}
                        className="text-xs px-2 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50"
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                  <pre className="p-3 text-xs text-slate-700 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
{planMarkdown}
                  </pre>

                  {/* 建议新建任务 */}
                  {suggestedTasks.length > 0 && (
                    <div className="border-t border-green-200 p-3 bg-green-50/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-green-700">建议新建任务 ({suggestedTasks.length})</span>
                        {selectedTaskIdx.size > 0 && (
                          <button
                            onClick={handleCreateSelectedTasks}
                            disabled={creatingTasks}
                            className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {creatingTasks ? '创建中...' : `创建选中 (${selectedTaskIdx.size})`}
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {suggestedTasks.map((t, i) => (
                          <label key={i} className="flex items-start gap-2 p-2 bg-white rounded border border-slate-200 hover:border-green-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedTaskIdx.has(i)}
                              onChange={() => toggleTaskSelection(i)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-700 truncate">{t.title}</span>
                                <span className={`text-xs px-1 py-0 rounded flex-shrink-0 ${
                                  t.priority === 'high' ? 'bg-red-50 text-red-600' :
                                  t.priority === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                                  'bg-slate-50 text-slate-500'
                                }`}>{t.priority}</span>
                              </div>
                              {t.reason && (
                                <div className="text-xs text-slate-400 mt-0.5">{t.reason}</div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 日报错误 */}
              {summaryError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {summaryError}
                </div>
              )}

              {/* 日报 loading */}
              {summaryLoading && (
                <div className="mt-3 p-3 text-sm text-slate-400 animate-pulse">
                  正在收集今日数据并生成工作日报...
                </div>
              )}

              {/* 日报结果 */}
              {summaryMarkdown && !summaryLoading && (
                <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">工作日报草稿</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleCopySummary}
                        className="text-xs px-2 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50"
                      >
                        {summaryCopied ? '✓ 已复制' : '复制'}
                      </button>
                      <button
                        onClick={handleAppendToDaily}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        追加到 Daily
                      </button>
                      <button
                        onClick={() => { setSummaryMarkdown(null); setSummaryError(null); }}
                        className="text-xs px-2 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50"
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                  <pre className="p-3 text-xs text-slate-700 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
{summaryMarkdown}
                  </pre>
                </div>
              )}
            </div>
          </section>

          {/* 最近活动 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">📝 最近活动</h2>
            </div>
            <div className="p-5">
              <div className="space-y-2.5">
                {recentNotes.map(n => (
                  <div key={n.id} className="flex items-center gap-3 text-sm">
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded flex-shrink-0">笔记</span>
                    <Link href={`/notes/${n.slug}`} className="text-slate-700 hover:text-blue-600 hover:underline flex-1 truncate">
                      {n.title || '无标题'}
                    </Link>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{formatTime(n.updatedAt)}</span>
                  </div>
                ))}
                {recentMemos.map(m => (
                  <div key={m.id} className="flex items-center gap-3 text-sm">
                    <span className="text-xs px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded flex-shrink-0">备忘</span>
                    <Link href="/memos" className="text-slate-700 hover:text-blue-600 hover:underline flex-1 truncate">
                      {m.excerpt || '无内容'}
                    </Link>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{formatTime(m.updatedAt)}</span>
                  </div>
                ))}
                {recentNotes.length === 0 && recentMemos.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">暂无最近活动</p>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 右列 1/3 */}
        <div className="space-y-6">
          {/* 快速创建 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">⚡ 快速创建</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              {quickCreateItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition text-center"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs text-slate-600">{item.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* AI 使用情况 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">💳 AI 使用情况</h2>
              <Link href="/usage" className="text-xs text-slate-500 hover:text-blue-600 whitespace-nowrap">
                详情 →
              </Link>
            </div>
            <div className="p-5">
              {usageLoading ? (
                <p className="text-sm text-slate-400 text-center py-4">加载中...</p>
              ) : !usageData || !usageData.configured ? (
                <div className="text-center py-3">
                  <p className="text-sm text-slate-500 mb-1">new-api 统计未配置</p>
                  <p className="text-xs text-slate-400">需配置 NEW_API_ADMIN_TOKEN</p>
                </div>
              ) : usageData.error && !usageData.summary ? (
                <div className="text-center py-3">
                  <p className="text-sm text-red-500 mb-1">⚠️ {usageData.error}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 余额 */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-500">当前余额</span>
                    <span className="text-lg font-bold text-slate-800">
                      {usageData.summary?.balance != null ? `$${usageData.summary.balance.toFixed(2)}` : '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-slate-400">今日消耗</div>
                      <div className="font-medium text-slate-700">
                        {usageData.summary?.usedToday != null ? `$${usageData.summary.usedToday.toFixed(2)}` : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">7 日消耗</div>
                      <div className="font-medium text-slate-700">
                        {usageData.summary?.used7d != null ? `$${usageData.summary.used7d.toFixed(2)}` : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">今日请求</div>
                      <div className="font-medium text-slate-700">
                        {usageData.summary?.requestCountToday != null ? usageData.summary.requestCountToday : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">今日 tokens</div>
                      <div className="font-medium text-slate-700">
                        {usageData.summary?.tokenCountToday != null ? usageData.summary.tokenCountToday.toLocaleString() : '-'}
                      </div>
                    </div>
                  </div>
                  {/* 使用最多模型 */}
                  {usageData.byModel && usageData.byModel.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-xs text-slate-400 mb-1">使用最多模型</div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700 truncate">{usageData.byModel[0].model}</span>
                        <span className="text-xs text-slate-500 ml-2">
                          {usageData.byModel[0].requests} 次 / ${usageData.byModel[0].cost.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* GitHub 知识库状态 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">📚 知识库</h2>
              <Link href="/repos" className="text-xs text-slate-500 hover:text-blue-600 whitespace-nowrap">
                进入 →
              </Link>
            </div>
            <div className="p-5">
              {repos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无仓库</p>
              ) : (
                <div className="space-y-2">
                  {repos.map(r => (
                    <Link
                      key={r.id}
                      href={`/repos?repoId=${r.id}`}
                      className="block p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700 truncate">{r.name}</span>
                        <span className="text-xs text-slate-400 whitespace-nowrap ml-2">{r.documentCount} 篇</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">同步: {formatSyncTime(r.lastSyncAt)}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* GitHub 今日活动 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">📊 今日提交</h2>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {totalCommitsToday > 0 ? `${totalCommitsToday} 次` : '无'}
              </span>
            </div>
            <div className="p-5">
              {totalCommitsToday === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">今日暂无提交</p>
              ) : (
                <div className="space-y-3">
                  {/* 每个 repo 的提交数 */}
                  <div className="flex flex-wrap gap-2">
                    {activityRepos.map(r => (
                      <Link
                        key={r.repoId}
                        href={`/repos?repoId=${r.repoId}`}
                        className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-200 hover:bg-indigo-100 transition"
                      >
                        {r.repoName}: {r.commits.length}
                      </Link>
                    ))}
                  </div>
                  {/* 最近 5 条 commit */}
                  <div className="space-y-1.5">
                    {activityRepos
                      .flatMap(r => r.commits.map(c => ({ ...c, repoName: r.repoName, repoId: r.repoId })))
                      .slice(0, 5)
                      .map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="font-mono text-indigo-600 flex-shrink-0">{c.shortHash}</span>
                          <span className="text-slate-600 flex-1 truncate">{c.message}</span>
                          <span className="text-slate-400 whitespace-nowrap flex-shrink-0">{c.repoName}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 未完成任务概览 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">⏳ 未完成</h2>
              <Link href="/tasks" className="text-xs text-slate-500 hover:text-blue-600 whitespace-nowrap">
                全部 →
              </Link>
            </div>
            <div className="p-5">
              {undoneTasks.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">🎉 所有任务已完成！</p>
              ) : (
                <ul className="space-y-2">
                  {undoneTasks.map(t => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                      <span className="text-slate-700 truncate flex-1">{t.title}</span>
                      {t.priority === 'high' && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded flex-shrink-0">高</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
