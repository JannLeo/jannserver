'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  epubUrl: string;
  epubPath: string;
  description: string;
  language: string;
}

interface Progress {
  currentCfi: string;
  currentPage: number;
  progressPercent: number;
}

interface Highlight {
  id: number;
  bookId: string;
  cfiRange: string;
  chapterHref: string;
  highlightedText: string;
  note: string;
  noteId: string | null;
  color: string;
  createdAt: string;
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(253, 224, 71, 0.4)',
  green: 'rgba(134, 239, 172, 0.4)',
  blue: 'rgba(147, 197, 253, 0.4)',
  pink: 'rgba(249, 168, 212, 0.4)',
};

export default function ReadingReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [bookId, setBookId] = useState<string>('');
  const [book, setBook] = useState<Book | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHighlights, setShowHighlights] = useState(false);
  const [toc, setToc] = useState<any[]>([]);
  const [currentChapter, setCurrentChapter] = useState('');

  // Selection popover state
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selChapter, setSelChapter] = useState('');
  const [selCfi, setSelCfi] = useState('');
  const [noteText, setNoteText] = useState('');
  const [selColor, setSelColor] = useState('yellow');
  const [saving, setSaving] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const bookRef = useRef<any>(null);

  // Resolve params
  useEffect(() => {
    params.then(p => setBookId(decodeURIComponent(p.id)));
  }, [params]);

  // Load book data and init epub
  useEffect(() => {
    if (!bookId) return;

    const init = async () => {
      setLoading(true);
      setError(null);

      // Load book metadata
      const bookRes = await fetch(`/api/books/${encodeURIComponent(bookId)}`);
      if (!bookRes.ok) { setError('书籍未找到'); setLoading(false); return; }
      const { book: b, progress: p } = await bookRes.json();
      setBook(b);
      setProgress(p);

      // Load highlights
      const hlRes = await fetch(`/api/books/${encodeURIComponent(bookId)}/highlights`);
      if (hlRes.ok) setHighlights(await hlRes.json());

      // Try to init epub
      if (b.epubUrl || b.epubPath) {
        try {
          const Epub = (await import('epubjs')).default;
          const bookInstance = Epub(b.epubUrl || `/files/${b.epubPath}`);
          bookRef.current = bookInstance;

          bookInstance.loaded.navigation.then((nav: any) => {
            setToc(nav.toc ?? []);
          });

          bookInstance.ready.then(() => {
            const rendition = bookInstance.renderTo(viewerRef.current!, {
              width: '100%',
              height: '100%',
              spread: 'auto',
            });
            renditionRef.current = rendition;

            // Apply saved highlights
            highlights.forEach(hl => {
              if (hl.cfiRange) {
                try {
                  rendition.annotations.highlight(hl.cfiRange, {}, () => {}, 'hl', { fill: HIGHLIGHT_COLORS[hl.color] ?? HIGHLIGHT_COLORS.yellow });
                } catch {}
              }
            });

            if (p?.currentCfi) {
              rendition.display(p.currentCfi).catch(() => {});
            } else {
              rendition.display().catch(() => {});
            }

            rendition.on('locationChanged', async (loc: any) => {
              const cfi = loc.start.cfi;
              const pct = bookInstance.locations.percentageFromCfi(cfi) ?? 0;
              setProgress({ currentCfi: cfi, currentPage: 0, progressPercent: pct });
              setCurrentChapter(loc.start.href ?? '');
              // Save progress
              await fetch(`/api/books/${encodeURIComponent(bookId)}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentCfi: cfi, progressPercent: pct }),
              });
            });
          });
        } catch (e: any) {
          console.error('epubjs init error:', e);
        }
      }

      setLoading(false);
    };

    init();

    return () => {
      if (bookRef.current) {
        try { bookRef.current.destroy(); } catch {}
      }
    };
  }, [bookId]);

  // Text selection handler
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectionPos(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
      setSelCfi(bookRef.current?.location?.start?.cfi ?? '');
      setSelChapter(currentChapter);
      setNoteText('');
    };

    document.addEventListener('mouseup', handleSelectionChange);
    return () => document.removeEventListener('mouseup', handleSelectionChange);
  }, [currentChapter]);

  const saveHighlight = async (saveToNote: boolean) => {
    if (!selectedText) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${encodeURIComponent(bookId)}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cfiRange: selCfi,
          chapterHref: selChapter,
          highlightedText: selectedText,
          note: noteText,
          color: selColor,
          saveToNote,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newHighlight: Highlight = {
          id: data.id as number,
          bookId,
          cfiRange: selCfi,
          chapterHref: selChapter,
          highlightedText: selectedText,
          note: noteText,
          noteId: data.noteId,
          color: selColor,
          createdAt: new Date().toISOString(),
        };
        setHighlights(prev => [newHighlight, ...prev]);

        // Apply highlight to epub
        if (renditionRef.current && selCfi) {
          try {
            renditionRef.current.annotations.highlight(selCfi, {}, () => {}, { fill: HIGHLIGHT_COLORS[selColor] ?? HIGHLIGHT_COLORS.yellow });
          } catch {}
        }

        window.getSelection()?.removeAllRanges();
        setSelectionPos(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteHighlight = async (id: number) => {
    await fetch(`/api/books/${encodeURIComponent(bookId)}/highlights?highlight_id=${id}`, { method: 'DELETE' });
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const prevPage = () => renditionRef.current?.prev();
  const nextPage = () => renditionRef.current?.next();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-teal-600" />
          <p className="mt-4 text-sm text-stone-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="text-center">
          <p className="text-5xl">📖</p>
          <p className="mt-4 text-lg font-bold text-stone-600">{error ?? '书籍未找到'}</p>
          <Link href="/reading" className="mt-4 inline-block rounded-xl bg-[#173f3c] px-6 py-2 text-sm font-bold text-amber-50">返回书架</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-stone-100">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link href="/reading" className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50">← 书架</Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-stone-900">{book.title}</p>
            <p className="truncate text-xs text-stone-500">{book.author}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Progress indicator */}
          {progress && (
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
              {Math.round(progress.progressPercent * 100)}%
            </span>
          )}
          {/* Highlights toggle */}
          <button
            onClick={() => setShowHighlights(v => !v)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${showHighlights ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}
          >📝 笔记 ({highlights.length})</button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Reader area */}
        <div className="flex flex-1 flex-col">
          {/* epub viewer */}
          {book.epubUrl || book.epubPath ? (
            <div className="relative flex-1 overflow-hidden">
              <div ref={viewerRef} className="h-full w-full" />
            </div>
          ) : (
            /* No epub — show placeholder reader */
            <div className="flex flex-1 flex-col items-center justify-center p-8">
              <div className="surface-card max-w-2xl rounded-3xl p-8 text-center">
                {book.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={book.coverUrl} alt={book.title} className="mx-auto max-h-64 rounded-2xl object-contain shadow-lg" />
                )}
                <h2 className="mt-6 text-2xl font-black text-stone-900">{book.title}</h2>
                <p className="mt-2 text-stone-500">{book.author}</p>
                {book.description && (
                  <p className="mt-4 text-sm leading-relaxed text-stone-600">{book.description}</p>
                )}
                <p className="mt-6 rounded-xl bg-stone-100 px-6 py-4 text-sm text-stone-500">
                  📚 当前书籍暂无电子版，可以去搜索下载 epub 文件后手动添加链接到书籍
                </p>
              </div>
            </div>
          )}

          {/* Page nav controls (only if epub is loaded) */}
          {book.epubUrl && (
            <div className="flex items-center justify-center gap-6 border-t border-stone-200 bg-white/80 py-3">
              <button onClick={prevPage} className="rounded-xl border border-stone-200 px-4 py-1.5 text-sm font-bold text-stone-600 hover:bg-stone-50">← 上一页</button>
              <span className="text-xs text-stone-400">
                {progress ? `${Math.round(progress.progressPercent * 100)}%` : ''}
              </span>
              <button onClick={nextPage} className="rounded-xl border border-stone-200 px-4 py-1.5 text-sm font-bold text-stone-600 hover:bg-stone-50">下一页 →</button>
            </div>
          )}
        </div>

        {/* Highlights sidebar */}
        {showHighlights && (
          <aside className="w-80 flex-shrink-0 overflow-y-auto border-l border-stone-200 bg-white/90 p-4 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-black text-stone-900">📝 读书笔记</h2>
            {highlights.length === 0 ? (
              <p className="text-xs text-stone-400">选中文本添加笔记</p>
            ) : (
              <div className="space-y-3">
                {highlights.map(hl => (
                  <div key={hl.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div
                      className="mb-2 rounded-lg border-l-4 border-l-amber-300 bg-white/70 px-3 py-2 text-sm leading-relaxed text-stone-700"
                      style={{ backgroundColor: HIGHLIGHT_COLORS[hl.color] }}
                    >
                      {hl.highlightedText}
                    </div>
                    {hl.note && (
                      <p className="mb-2 text-xs italic text-stone-500">{hl.note}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-stone-400">{new Date(hl.createdAt).toLocaleDateString('zh-CN')}</span>
                      <button onClick={() => deleteHighlight(hl.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ── Selection Popover ── */}
      {selectionPos && (
        <div
          className="fixed z-50 flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm"
          style={{ left: Math.min(selectionPos.x, window.innerWidth - 260), top: selectionPos.y - 180, width: 250 }}
        >
          <p className="line-clamp-3 text-xs leading-relaxed text-stone-700">{selectedText.slice(0, 100)}</p>

          {/* Color picker */}
          <div className="flex gap-2">
            {Object.entries(HIGHLIGHT_COLORS).map(([color, hex]) => (
              <button
                key={color}
                onClick={() => setSelColor(color)}
                className={`h-6 w-6 rounded-full border-2 transition ${selColor === color ? 'border-stone-900 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: hex }}
                title={color}
              />
            ))}
          </div>

          {/* Note input */}
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="添加笔记（可选）..."
            rows={2}
            className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-300"
          />

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => saveHighlight(false)}
              disabled={saving}
              className="flex-1 rounded-xl bg-amber-100 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-200"
            >仅高亮</button>
            <button
              onClick={() => saveHighlight(true)}
              disabled={saving}
              className="flex-1 rounded-xl bg-teal-600 py-1.5 text-xs font-bold text-white hover:bg-teal-700"
            >保存笔记</button>
          </div>
        </div>
      )}
    </div>
  );
}