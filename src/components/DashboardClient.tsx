'use client';
import { useState } from 'react';
import Link from 'next/link';

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
  const { todayDate, todayTasks, undoneTasks, recentNotes, recentMemos, repos } = data;
  const { totalCommits: totalCommitsToday } = activity;
  const [tasks, setTasks] = useState<Task[]>(todayTasks);
  const [toggling, setToggling] = useState<string | null>(null);

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

  const quickCreateItems = [
    { href: '/notes/new', icon: '📝', label: '新建笔记' },
    { href: '/memos?new=1', icon: '💡', label: '新建备忘' },
    { href: '/tasks?new=1', icon: '✅', label: '新建任务' },
    { href: '/daily', icon: '📅', label: '今日 Daily' },
  ];

  return (
    <div className="h-full max-w-5xl mx-auto p-6 space-y-6">
      {/* Section 1: Greeting */}
      <section className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 sm:p-6 border border-blue-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
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
          <div className="flex gap-2 flex-wrap">
            <Link href="/ask" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition">🤖 AI 问答</Link>
            <Link href="/daily" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition">📅 今日 Daily</Link>
          </div>
        </div>
      </section>

      {/* Section 2: Today's Tasks */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">📋 今日任务</h2>
          <Link href="/tasks" className="text-xs text-slate-500 hover:text-blue-600">全部任务 →</Link>
        </div>
        <div className="p-5">
          {tasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-2">🎉</p>
              <p className="text-sm text-slate-400">今日暂无任务</p>
              <Link href="/tasks?new=1" className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">创建任务</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {inProgressTasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-yellow-600 mb-2 uppercase tracking-wide">进行中</h3>
                  <div className="space-y-1">{inProgressTasks.map(t => (
                    <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />
                  ))}</div>
                </div>
              )}
              {todoTasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">待办</h3>
                  <div className="space-y-1">{todoTasks.map(t => (
                    <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />
                  ))}</div>
                </div>
              )}
              {doneTasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-green-600 mb-2 uppercase tracking-wide">已完成 ({doneTasks.length})</h3>
                  <div className="space-y-1">{doneTasks.map(t => (
                    <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />
                  ))}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Section 3: Quick Actions & Recent Activity */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">⚡ 快捷操作</h2>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {quickCreateItems.map(item => (
              <Link key={item.href} href={item.href}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition text-center">
                <span className="text-2xl">{item.icon}</span>
                <span className="text-xs text-slate-600">{item.label}</span>
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">最近活动</h3>
            {recentNotes.length === 0 && recentMemos.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-2">暂无最近活动</p>
            ) : (
              <div className="space-y-2">
                {recentNotes.map(n => (
                  <div key={n.id} className="flex items-center gap-3 text-sm">
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">笔记</span>
                    <Link href={`/notes/${n.slug}`} className="text-slate-700 hover:text-blue-600 hover:underline flex-1 truncate">{n.title || '无标题'}</Link>
                  </div>
                ))}
                {recentMemos.map(m => (
                  <div key={m.id} className="flex items-center gap-3 text-sm">
                    <span className="text-xs px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded">备忘</span>
                    <span className="text-slate-700 truncate flex-1">{m.excerpt || '无内容'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}