'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface TrendingRepo {
  name: string;
  href: string;
  description: string;
  language: string;
  languageColor: string;
  stars: string;
  todayStars: string;
}

type Since = 'daily' | 'weekly' | 'monthly';

const SINCE_OPTIONS: { value: Since; label: string }[] = [
  { value: 'daily', label: '今日' },
  { value: 'weekly', label: '本周' },
  { value: 'monthly', label: '本月' },
];

const SINCE_LABELS: Record<Since, string> = {
  daily: '今日',
  weekly: '本周',
  monthly: '本月',
};

function formatStars(s: string): string {
  const n = parseInt(s.replace(/[^0-9.]/g, ''), 10);
  if (isNaN(n)) return s;
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return s;
}

export default function TrendingPage() {
  const [repos, setRepos] = useState<TrendingRepo[]>([]);
  const [since, setSince] = useState<Since>('weekly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = useCallback(async (s: Since) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trending?since=${s}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRepos(data.repos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取趋势失败');
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrending(since);
  }, [since, fetchTrending]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Banner ── */}
      <section className="surface-card relative overflow-hidden rounded-2xl p-6 sm:p-8">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-purple-200/30 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">GitHub Explorer</p>
          <h1 className="mt-2 text-3xl font-black leading-[1.05] tracking-[-0.04em] text-stone-950 sm:text-4xl">
            🔥 Trending
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
            {since === 'daily' && '今日'}
            {since === 'weekly' && '本周'}
            {since === 'monthly' && '本月'}
            开发者都在关注什么，了解为何这些仓库登上热榜
          </p>
        </div>
        {/* Filter tabs */}
        <div className="mt-5 flex gap-2">
          {SINCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSince(opt.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                since === opt.value
                  ? 'bg-stone-900 text-stone-50 shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Loading ── */}
      {loading && (
        <div className="mt-8 flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-stone-900" />
          <span className="ml-3 text-sm text-stone-500">加载中...</span>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <p className="text-lg font-bold text-red-600">⚠️ 加载失败</p>
          <p className="mt-1 text-sm text-red-500">{error}</p>
          <button
            onClick={() => fetchTrending(since)}
            className="mt-4 rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            重试
          </button>
        </div>
      )}

      {/* ── Repo List ── */}
      {!loading && !error && (
        <>
          <div className="mt-5 mb-3 text-xs font-semibold text-stone-400">
            共 {repos.length} 个仓库
          </div>
          <div className="space-y-3">
            {repos.map((repo, idx) => {
              const [owner, ...rest] = repo.name.replace(/^\//, '').split('/');
              const repoName = rest.join('/');
              return (
                <a
                  key={repo.name}
                  href={`https://github.com${repo.href}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-2xl border border-stone-900/10 bg-white/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500/30 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: repo info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 flex-shrink-0 text-stone-400" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                        </svg>
                        <span className="text-sm font-bold text-stone-900 group-hover:text-teal-700 transition-colors">
                          {repoName}
                        </span>
                        <span className="text-xs text-stone-400">/</span>
                        <span className="text-xs font-semibold text-stone-500">{owner}</span>
                      </div>

                      {repo.description && (
                        <p className="mt-2 text-sm leading-relaxed text-stone-600 line-clamp-2">
                          {repo.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {repo.language && (
                          <span className="flex items-center gap-1.5 text-xs text-stone-500">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: repo.languageColor }}
                            />
                            {repo.language}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-amber-600 font-semibold">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.751.751 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
                          </svg>
                          {formatStars(repo.stars)}
                        </span>
                      </div>
                    </div>

                    {/* Right: today's stars badge */}
                    {repo.todayStars && (
                      <span className="flex-shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                        {repo.todayStars}
                      </span>
                    )}
                  </div>
                </a>
              );
            })}
          </div>

          {repos.length === 0 && (
            <div className="mt-8 rounded-2xl border border-dashed border-stone-200 py-16 text-center">
              <p className="text-3xl">📦</p>
              <p className="mt-2 font-semibold text-stone-500">暂无趋势数据</p>
              <p className="text-xs text-stone-400">该时间范围下暂无可用仓库</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}