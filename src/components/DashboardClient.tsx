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
  const isHigh = task.priority === 'high' && !isDone;
  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-transparent bg-white/45 p-3 transition hover:border-stone-900/10 hover:bg-white/80 hover:shadow-sm">
      <button
        onClick={() => onToggle(task.id, task.status)}
        disabled={toggling}
        aria-label={isDone ? '标记为未完成' : '标记为已完成'}
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
      <span className={`min-w-0 flex-1 text-sm font-semibold ${isDone ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
        {task.title}
      </span>
      {isHigh && (
        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-black text-red-600">高优先</span>
      )}
    </div>
  );
}

function StatCard({ label, value, tone, suffix }: { label: string; value: number | string; tone: string; suffix?: string }) {
  return (
    <div className="surface-card rounded-[1.35rem] p-4">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <div className="mt-3 flex items-end gap-2">
        <span className={`text-3xl font-black tracking-[-0.06em] ${tone}`}>{value}</span>
        {suffix && <span className="pb-1 text-xs font-bold text-stone-400">{suffix}</span>}
      </div>
    </div>
  );
}

export default function DashboardClient({ data, activity }: { data: DashboardData; activity: ActivityData }) {
  const { todayDate, todayTasks, undoneTasks, recentNotes, recentMemos, repos } = data;
  const { totalCommits: totalCommitsToday } = activity;
  const [tasks, setTasks] = useState<Task[]>(todayTasks);
  const [toggling, setToggling] = useState<string | null>(null);

  const greeting = getGreeting(new Date().getHours());
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done');
  const todayCompleted = doneTasks.length;
  const todayTodo = todoTasks.length + inProgressTasks.length;
  const recentActivityCount = recentNotes.length + recentMemos.length;

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
    { href: '/notes/new', icon: '✍️', label: '新建笔记', hint: '沉淀想法' },
    { href: '/memos?new=1', icon: '💡', label: '新建备忘', hint: '快速记录' },
    { href: '/tasks?new=1', icon: '✓', label: '新建任务', hint: '安排下一步' },
    { href: '/daily', icon: '☀️', label: '今日 Daily', hint: '复盘今天' },
  ];

  return (
    <div className="relative mx-auto min-h-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute right-8 top-8 hidden h-48 w-48 rounded-full bg-teal-300/20 blur-3xl lg:block" />

      <section className="surface-card relative overflow-hidden rounded-[2rem] p-5 sm:p-7 lg:p-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-300/28 blur-2xl" />
        <div className="absolute bottom-0 right-0 h-28 w-44 rounded-tl-[4rem] bg-[#173f3c]/8" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="section-kicker">{todayDate}</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.06em] text-stone-950 sm:text-5xl lg:text-6xl">
              {greeting}，把今天的系统跑顺。
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600">
              现在有 <span className="font-black text-[#0f766e]">{todayTodo}</span> 个待办、
              <span className="font-black text-emerald-700"> {todayCompleted}</span> 个已完成，
              今日代码活动 <span className="font-black text-stone-900">{totalCommitsToday}</span> 次提交。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="待办" value={todayTodo} tone="text-[#0f766e]" suffix="项" />
            <StatCard label="完成" value={todayCompleted} tone="text-emerald-700" suffix="项" />
            <StatCard label="活动" value={recentActivityCount} tone="text-amber-700" suffix="条" />
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="surface-card overflow-hidden rounded-[1.75rem]">
          <div className="flex items-center justify-between border-b border-stone-900/10 px-5 py-4 sm:px-6">
            <div>
              <p className="section-kicker">Focus queue</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-stone-900">今日任务</h2>
            </div>
            <Link href="/tasks" className="rounded-full border border-stone-900/10 bg-white/55 px-3 py-1.5 text-xs font-black text-stone-600 transition hover:border-teal-500/40 hover:text-teal-700">全部任务 →</Link>
          </div>
          <div className="p-4 sm:p-5">
            {tasks.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-stone-300 bg-white/40 py-12 text-center">
                <p className="text-5xl">🎉</p>
                <p className="mt-3 text-sm font-bold text-stone-500">今日暂无任务，可以舒服地开新局。</p>
                <Link href="/tasks?new=1" className="mt-5 inline-flex rounded-full bg-[#173f3c] px-5 py-2.5 text-sm font-black text-amber-50 shadow-lg shadow-teal-900/10 transition hover:-translate-y-0.5">创建任务</Link>
              </div>
            ) : (
              <div className="space-y-6">
                {inProgressTasks.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-amber-700">进行中</h3>
                    <div className="space-y-2">{inProgressTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} toggling={toggling === t.id} />)}</div>
                  </div>
                )}
                {todoTasks.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-stone-500">待办</h3>
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

        <div className="space-y-6">
          <section className="surface-card rounded-[1.75rem] p-5 sm:p-6">
            <p className="section-kicker">Launch pad</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-stone-900">快捷操作</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {quickCreateItems.map(item => (
                <Link key={item.href} href={item.href} className="group rounded-[1.35rem] border border-stone-900/10 bg-white/45 p-4 transition hover:-translate-y-0.5 hover:border-teal-500/30 hover:bg-white/80 hover:shadow-lg hover:shadow-stone-900/5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#173f3c] text-xl font-black text-amber-100 shadow-[0_12px_28px_rgba(15,61,58,0.18)] transition group-hover:rotate-[-3deg] group-hover:scale-105">{item.icon}</div>
                  <p className="mt-3 text-sm font-black text-stone-900">{item.label}</p>
                  <p className="mt-1 text-xs font-semibold text-stone-500">{item.hint}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="surface-card rounded-[1.75rem] p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-kicker">Recent signals</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-stone-900">最近活动</h2>
              </div>
              <span className="rounded-full bg-stone-900/5 px-2.5 py-1 text-xs font-black text-stone-500">{recentActivityCount}</span>
            </div>
            <div className="mt-5 space-y-2">
              {recentNotes.length === 0 && recentMemos.length === 0 ? (
                <p className="rounded-2xl bg-white/45 py-6 text-center text-sm font-semibold text-stone-400">暂无最近活动</p>
              ) : (
                <>
                  {recentNotes.map(n => (
                    <div key={n.id} className="flex items-center gap-3 rounded-2xl bg-white/45 px-3 py-2.5 text-sm">
                      <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-black text-teal-700">笔记</span>
                      <Link href={`/notes/${n.slug}`} className="min-w-0 flex-1 truncate font-bold text-stone-700 hover:text-teal-700 hover:underline">{n.title || '无标题'}</Link>
                    </div>
                  ))}
                  {recentMemos.map(m => (
                    <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/45 px-3 py-2.5 text-sm">
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">备忘</span>
                      <span className="min-w-0 flex-1 truncate font-bold text-stone-700">{m.excerpt || '无内容'}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[#173f3c]/15 bg-[#173f3c] p-5 text-amber-50 shadow-[0_24px_70px_rgba(15,61,58,0.18)] sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-100/60">Knowledge base</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-3xl font-black tracking-[-0.06em]">{repos.length}</p>
                <p className="text-xs font-bold text-teal-100/65">仓库源</p>
              </div>
              <div>
                <p className="text-3xl font-black tracking-[-0.06em]">{undoneTasks.length}</p>
                <p className="text-xs font-bold text-teal-100/65">未完成任务</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
