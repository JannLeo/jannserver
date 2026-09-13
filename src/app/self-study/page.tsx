'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardData {
  totalCourses: number;
  completedModules: number;
  inProgressModules: number;
  streakDays: number;
  dueFlashcards: number;
  totalFlashcards: number;
  recentModules: { id: string; title: string; courseTitle: string; completedAt: string; }[];
}

export default function SelfStudyDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/self-study/dashboard').then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-teal-600">加载中...</div></div>;

  const cards = [
    { label: '总课程', value: data?.totalCourses ?? 0, icon: '📚', href: '/self-study/courses' },
    { label: '已完成模块', value: data?.completedModules ?? 0, icon: '✅', color: 'text-green-600', href: '/self-study/courses' },
    { label: '学习中', value: data?.inProgressModules ?? 0, icon: '📖', color: 'text-amber-600', href: '/self-study/courses' },
    { label: '待复习闪卡', value: data?.dueFlashcards ?? 0, icon: '🃏', href: '/self-study/flashcards', accent: (data?.dueFlashcards ?? 0) > 0 },
    { label: '累计天数', value: `🔥${data?.streakDays ?? 0}`, icon: '🔥', color: 'text-orange-500', href: '/self-study' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800">🎯 自学中心</h1>
        <p className="mt-1 text-sm text-stone-500">制定学习计划，跟踪进度，AI 辅助学习</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <div className={`rounded-2xl border p-4 transition hover:shadow-md ${c.accent ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white'}`}>
              <div className="text-2xl">{c.icon}</div>
              <div className={`mt-2 text-2xl font-bold ${c.color ?? 'text-stone-800'}`}>{c.value}</div>
              <div className="mt-0.5 text-xs text-stone-500">{c.label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold text-stone-700">📋 最近学习</h2>
        {data?.recentModules && data.recentModules.length > 0 ? (
          <div className="space-y-3">
            {data.recentModules.map((m) => (
              <Link key={m.id} href={`/self-study/courses/${m.id.split('-').slice(0, -1).join('-')}`}
                className="flex items-center justify-between rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
                <div>
                  <div className="text-sm font-semibold text-stone-700">{m.title}</div>
                  <div className="text-xs text-stone-400">{m.courseTitle}</div>
                </div>
                <span className="text-xs text-stone-400">
                  {new Date(m.completedAt).toLocaleDateString('zh-CN')}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-400">还没有学习记录，开始学习吧！</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/self-study/courses"
          className="flex items-center gap-4 rounded-2xl border border-teal-200 bg-teal-50 p-5 transition hover:shadow-md">
          <span className="text-3xl">📚</span>
          <div>
            <div className="font-bold text-stone-700">浏览课程</div>
            <div className="text-xs text-stone-500">结构化学习路径</div>
          </div>
        </Link>
        <Link href="/self-study/english"
          className="flex items-center gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 transition hover:shadow-md">
          <span className="text-3xl">🇬🇧</span>
          <div>
            <div className="font-bold text-stone-700">英语自学</div>
            <div className="text-xs text-stone-500">背单词·刷题·错题本</div>
          </div>
        </Link>
        <Link href="/self-study/tutor"
          className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:shadow-md">
          <span className="text-3xl">🤖</span>
          <div>
            <div className="font-bold text-stone-700">AI 导师</div>
            <div className="text-xs text-stone-500">智能问答·解释概念</div>
          </div>
        </Link>
        <Link href="/self-study/flashcards"
          className="flex items-center gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 transition hover:shadow-md">
          <span className="text-3xl">🃏</span>
          <div>
            <div className="font-bold text-stone-700">闪卡复习</div>
            <div className="text-xs text-stone-500">间隔重复·巩固记忆</div>
          </div>
        </Link>
      </div>
    </div>
  );
}