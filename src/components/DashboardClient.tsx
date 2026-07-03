'use client';
import { useState, useCallback } from 'react';
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

  const quickCreateItems = [
    { href: '/notes/new', icon: '📝', label: '新建笔记' },
    { href: '/memos?new=1', icon: '💡', label: '新建备忘' },
    { href: '/tasks?new=1', icon: '✅', label: '新建任务' },
    { href: '/daily', icon: '📅', label: '今日 Daily' },
    { href: '/projects?new=1', icon: '📁', label: '新建项目' },
    { href: '/ask', icon: '🤖', label: 'AI 问答' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
              {/* AI 快捷按钮占位（Phase 4.3/4.4 实现） */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2 flex-wrap">
                <button
                  disabled
                  className="px-3 py-1.5 text-xs text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed"
                  title="后续阶段实现"
                >
                  📝 生成工作日报
                </button>
                <button
                  disabled
                  className="px-3 py-1.5 text-xs text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed"
                  title="后续阶段实现"
                >
                  📋 生成今日计划
                </button>
                <button
                  disabled
                  className="px-3 py-1.5 text-xs text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed"
                  title="后续阶段实现"
                >
                  📊 总结 GitHub 提交
                </button>
              </div>
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
