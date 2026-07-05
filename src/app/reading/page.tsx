'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  coverUrl: string;
  epubUrl: string;
  description: string;
  language: string;
  source: string;
  addedAt: string;
}

interface Progress {
  bookId: string;
  currentPage: number;
  progressPercent: number;
  updatedAt: string;
}

interface SearchResult {
  key: string;
  title: string;
  author: string;
  coverUrl: string;
  bigCoverUrl: string;
  isbn: string;
  firstPublishYear: number;
  subjects: string[];
  publisher: string;
  language: string;
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-stone-200">
      <div
        className="h-1.5 rounded-full bg-teal-500 transition-all"
        style={{ width: `${Math.round(percent * 100)}%` }}
      />
    </div>
  );
}

export default function ReadingPage() {
  const [library, setLibrary] = useState<Book[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'library' | 'search'>('library');

  const loadLibrary = useCallback(async () => {
    const res = await fetch('/api/books');
    if (res.ok) {
      const data = await res.json();
      setLibrary(data.library ?? []);

      // Load progress for all books
      const progs: Record<string, Progress> = {};
      for (const book of (data.library ?? [])) {
        const r = await fetch(`/api/books/${encodeURIComponent(book.id)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.progress) progs[book.id] = d.progress;
        }
      }
      setProgressMap(progs);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearchDone(false); return; }
    setSearching(true);
    setSearchDone(false);
    try {
      const res = await fetch(`/api/books?q=${encodeURIComponent(q)}&type=title`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') doSearch(searchQuery);
  };

  const addToLibrary = async (result: SearchResult) => {
    setAddingId(result.key);
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `ol:${result.key}`,
          title: result.title,
          author: result.author,
          isbn: result.isbn,
          coverUrl: result.coverUrl || result.bigCoverUrl,
          language: result.language ?? 'en',
          source: 'openlibrary',
        }),
      });
      if (res.ok) {
        await loadLibrary();
        setActiveTab('library');
      }
    } finally {
      setAddingId(null);
    }
  };

  const deleteBook = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadLibrary();
    } finally {
      setDeletingId(null);
    }
  };

  const reading = library.filter(b => progressMap[b.id]?.progressPercent > 0);
  const notStarted = library.filter(b => !progressMap[b.id]?.progressPercent);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Banner ── */}
      <section className="surface-card relative overflow-hidden rounded-2xl p-6 sm:p-8">
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">Personal library</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-stone-950 sm:text-4xl">📚 读书计划</h1>
          <p className="mt-3 max-w-xl text-sm text-stone-600">
            搜索下载书籍、追踪阅读进度、划词做笔记，同步微信读书进度
          </p>
        </div>
        {/* Tab switcher */}
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => setActiveTab('library')}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${activeTab === 'library' ? 'bg-stone-900 text-stone-50' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >书架 ({library.length})</button>
          <button
            onClick={() => setActiveTab('search')}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${activeTab === 'search' ? 'bg-stone-900 text-stone-50' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >🔍 搜索书籍</button>
        </div>
      </section>

      {/* ── Library Tab ── */}
      {activeTab === 'library' && (
        <div className="mt-6">
          {library.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 py-20 text-center">
              <p className="text-5xl">📖</p>
              <p className="mt-4 text-lg font-bold text-stone-500">书架是空的</p>
              <p className="mt-1 text-sm text-stone-400">去搜索添加你的第一本书吧</p>
              <button
                onClick={() => setActiveTab('search')}
                className="mt-5 rounded-full bg-[#173f3c] px-6 py-2.5 text-sm font-black text-amber-50 shadow-lg hover:-translate-y-0.5"
              >搜索书籍</button>
            </div>
          ) : (
            <>
              {reading.length > 0 && (
                <div className="mb-6">
                  <h2 className="mb-3 text-sm font-black uppercase tracking-[0.15em] text-stone-500">在读</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {reading.map(book => {
                      const prog = progressMap[book.id];
                      return (
                        <div key={book.id} className="group relative rounded-2xl border border-stone-900/10 bg-white/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                          <Link href={`/reading/${encodeURIComponent(book.id)}`} className="block">
                            {book.coverUrl ? (
                              <div className="relative mb-3 aspect-[2/3] w-full overflow-hidden rounded-xl bg-stone-100">
                                <Image src={book.coverUrl} alt={book.title} fill className="object-cover" sizes="200px" />
                              </div>
                            ) : (
                              <div className="mb-3 flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-teal-50 text-4xl">📕</div>
                            )}
                            <h3 className="line-clamp-2 text-sm font-bold text-stone-900">{book.title}</h3>
                            <p className="mt-1 line-clamp-1 text-xs text-stone-500">{book.author || '未知作者'}</p>
                          </Link>
                          <ProgressBar percent={prog?.progressPercent ?? 0} />
                          <p className="mt-1.5 text-right text-xs text-stone-400">
                            {Math.round((prog?.progressPercent ?? 0) * 100)}%
                          </p>
                          <button
                            onClick={() => deleteBook(book.id)}
                            className="absolute right-2 top-2 rounded-full bg-white/80 px-2 py-1 text-xs text-red-500 opacity-0 transition hover:bg-red-50 group-hover:opacity-100"
                          >删除</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {notStarted.length > 0 && (
                <div>
                  <h2 className="mb-3 text-sm font-black uppercase tracking-[0.15em] text-stone-500">未读</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {notStarted.map(book => (
                      <div key={book.id} className="group relative rounded-2xl border border-stone-900/10 bg-white/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                        <Link href={`/reading/${encodeURIComponent(book.id)}`} className="block">
                          {book.coverUrl ? (
                            <div className="relative mb-3 aspect-[2/3] w-full overflow-hidden rounded-xl bg-stone-100">
                              <Image src={book.coverUrl} alt={book.title} fill className="object-cover" sizes="200px" />
                            </div>
                          ) : (
                            <div className="mb-3 flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-teal-50 text-4xl">📕</div>
                          )}
                          <h3 className="line-clamp-2 text-sm font-bold text-stone-900">{book.title}</h3>
                          <p className="mt-1 line-clamp-1 text-xs text-stone-500">{book.author || '未知作者'}</p>
                          <p className="mt-2 text-xs text-stone-400">添加于 {formatDate(book.addedAt)}</p>
                        </Link>
                        <button
                          onClick={() => deleteBook(book.id)}
                          className="absolute right-2 top-2 rounded-full bg-white/80 px-2 py-1 text-xs text-red-500 opacity-0 transition hover:bg-red-50 group-hover:opacity-100"
                        >删除</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Search Tab ── */}
      {activeTab === 'search' && (
        <div className="mt-6">
          <div className="mb-5 flex gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="输入书名、作者或 ISBN..."
              className="flex-1 rounded-2xl border border-stone-200 bg-white/70 px-4 py-3 text-sm text-stone-900 placeholder-stone-400 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            <button
              onClick={() => doSearch(searchQuery)}
              className="rounded-2xl bg-[#173f3c] px-6 py-3 text-sm font-bold text-amber-50 shadow-sm hover:-translate-y-0.5"
            >搜索</button>
          </div>

          {searching && (
            <div className="flex items-center gap-3 py-8 text-stone-500">
              <div className="h-6 w-6 animate-spin rounded-full border-3 border-stone-300 border-t-stone-900" />
              <span className="text-sm">搜索中...</span>
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {searchResults.map(result => {
                const isInLib = library.some(b =>
                  b.id === `ol:${result.key}` || b.id === `isbn:${result.isbn}`
                );
                const isAdding = addingId === result.key;
                return (
                  <div key={result.key} className="rounded-2xl border border-stone-900/10 bg-white/60 p-4 shadow-sm">
                    {result.coverUrl ? (
                      <div className="relative mb-3 aspect-[2/3] w-full overflow-hidden rounded-xl bg-stone-100">
                        <Image src={result.coverUrl} alt={result.title} fill className="object-cover" sizes="200px" />
                      </div>
                    ) : (
                      <div className="mb-3 flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-teal-50 text-4xl">📕</div>
                    )}
                    <h3 className="line-clamp-2 text-sm font-bold text-stone-900">{result.title}</h3>
                    <p className="mt-1 line-clamp-1 text-xs text-stone-500">{result.author || '未知作者'}</p>
                    {result.firstPublishYear && (
                      <p className="mt-1 text-xs text-stone-400">{result.firstPublishYear}</p>
                    )}
                    <button
                      onClick={() => addToLibrary(result)}
                      disabled={isInLib || isAdding}
                      className={`mt-3 w-full rounded-xl py-2 text-xs font-bold transition ${
                        isInLib
                          ? 'bg-stone-100 text-stone-400 cursor-default'
                          : 'bg-teal-600 text-white hover:bg-teal-700'
                      }`}
                    >
                      {isAdding ? '添加中...' : isInLib ? '已在书架' : '加入书架'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!searching && searchDone && searchResults.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-200 py-12 text-center">
              <p className="text-3xl">🔍</p>
              <p className="mt-2 font-semibold text-stone-500">没有找到相关书籍</p>
              <p className="text-xs text-stone-400">尝试不同的关键词或 ISBN</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}