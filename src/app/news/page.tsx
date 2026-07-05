'use client';
import { useState, useEffect, useCallback } from 'react';
import type { NewsItem, NewsResponse } from '@/app/api/news/route';

const CATEGORIES = [
  { key: '', label: '全部' },
  { key: 'world', label: '国际' },
  { key: 'tech', label: '科技' },
  { key: 'finance', label: '财经' },
];

function formatPubDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} 分钟前`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} 天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  world: '国际',
  tech: '科技',
  finance: '财经',
};

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');

  const fetchNews = useCallback(async (cat: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      params.set('limit', '50');
      const res = await fetch(`/api/news?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: NewsResponse = await res.json();
      setItems(data.items);
      setFetchedAt(data.fetchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取新闻失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(category);
  }, [category, fetchNews]);

  return (
    <div className="page-shell">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.02em] text-stone-900">
              📰 新闻聚合
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              实时聚合全球 RSS 新闻源{fetchedAt && ` · 更新于 ${formatPubDate(fetchedAt)}`}
            </p>
          </div>
          <div className="flex gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  category === cat.key
                    ? 'bg-[#173f3c] text-white shadow-sm'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading & Error states */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-[#173f3c]" />
            <span className="ml-3 text-stone-500">加载新闻中...</span>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
            <p className="text-lg font-bold text-red-600">⚠️ 加载失败</p>
            <p className="mt-1 text-sm text-red-500">{error}</p>
            <button
              onClick={() => fetchNews(category)}
              className="mt-4 rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white hover:bg-red-700"
            >
              重试
            </button>
          </div>
        )}

        {/* News grid */}
        {!loading && !error && (
          <>
            <div className="mb-3 text-sm font-semibold text-stone-400">
              共 {items.length} 条新闻
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, idx) => (
                <a
                  key={`${item.source}-${idx}`}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex flex-col rounded-2xl border border-stone-900/10 bg-white/70 p-4 shadow-sm transition-all hover:border-teal-500/30 hover:shadow-md"
                >
                  {/* Source badge */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-lg bg-[#173f3c]/10 px-2.5 py-0.5 text-xs font-bold text-[#173f3c]">
                      {item.source}
                    </span>
                    {item.category && (
                      <span className="rounded-lg bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-500">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="mb-2 line-clamp-3 text-sm font-bold leading-snug text-stone-800 transition group-hover:text-[#173f3c]">
                    {item.title}
                  </h3>

                  {/* Description */}
                  {item.description && (
                    <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-stone-500">
                      {item.description}
                    </p>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Timestamp */}
                  <div className="flex items-center gap-1.5 text-xs text-stone-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {formatPubDate(item.pubDate)}
                  </div>
                </a>
              ))}
            </div>

            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stone-200 py-16 text-center">
                <p className="text-2xl">📭</p>
                <p className="mt-2 font-semibold text-stone-500">暂无新闻</p>
                <p className="text-xs text-stone-400">该分类下暂无可用的新闻</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}