'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Flashcard { id: string; front: string; back: string; tags: string; source: string; course_title?: string; }

const RATING_LABELS = [
  { q: 0, label: '忘记', color: 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200' },
  { q: 2, label: '困难', color: 'bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200' },
  { q: 3, label: '一般', color: 'bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200' },
  { q: 4, label: '良好', color: 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200' },
  { q: 5, label: '简单', color: 'bg-teal-100 border-teal-300 text-teal-700 hover:bg-teal-200' },
];

export default function FlashcardsPage() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [stats, setStats] = useState({ total: 0, due: 0 });
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [reviewStart, setReviewStart] = useState<number>(0);
  const [mode, setMode] = useState<'review' | 'browse'>('review');

  const loadCards = useCallback(() => {
    setLoading(true);
    fetch(`/api/self-study/flashcards?due=${mode === 'review'}`)
      .then(r => r.json())
      .then(d => {
        setCards(d.flashcards ?? []);
        setStats(d.stats ?? { total: 0, due: 0 });
        setLoading(false);
        setCurrentIdx(0);
        setFlipped(false);
      }).catch(() => setLoading(false));
  }, [mode]);

  useEffect(() => { loadCards(); }, [loadCards]);

  const rate = async (quality: number) => {
    const card = cards[currentIdx];
    if (!card) return;
    const responseTimeMs = Date.now() - reviewStart;

    await fetch(`/api/self-study/flashcards/${card.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quality, responseTimeMs }),
    });

    setFlipped(false);
    if (currentIdx < cards.length - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      // All done
      setTimeout(() => {
        loadCards();
        setMode('browse');
      }, 600);
    }
  };

  const current = cards[currentIdx];
  const done = mode === 'browse' || currentIdx >= cards.length;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">🃏 闪卡复习</h1>
        <p className="mt-1 text-sm text-stone-500">使用间隔重复算法巩固记忆</p>
      </div>

      {/* Mode toggle & stats */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => { setMode('review'); setShowForm(false); }}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${mode === 'review' ? 'bg-teal-600 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>
            待复习 ({stats.due})
          </button>
          <button onClick={() => { setMode('browse'); setShowForm(false); }}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${mode === 'browse' ? 'bg-teal-600 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>
            全部卡片 ({stats.total})
          </button>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
          {showForm ? '取消' : '+ 新建'}
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '总卡片', value: stats.total },
          { label: '待复习', value: stats.due },
          { label: '当前进度', value: current ? `${currentIdx + 1}/${cards.length}` : '—' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-3 text-center">
            <div className="text-lg font-bold text-stone-700">{s.value}</div>
            <div className="text-xs text-stone-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <FlashcardForm onCreated={() => { setShowForm(false); loadCards(); }} />
      )}

      {/* Review mode */}
      {mode === 'review' && !showForm && (
        loading ? <div className="py-12 text-center text-stone-400">加载中...</div>
        : !current ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <div className="text-lg font-bold text-stone-700">太棒了！</div>
            <div className="mt-1 text-sm text-stone-500">暂无待复习的闪卡，稍后再来回顾吧！</div>
            <button onClick={() => setMode('browse')} className="mt-4 rounded-xl bg-teal-600 px-5 py-2 text-sm font-medium text-white">
              浏览所有卡片
            </button>
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-lg font-bold text-stone-700">本次复习完成！</div>
            <div className="mt-1 text-sm text-stone-500">复习了 {cards.length} 张卡片，继续保持！</div>
            <button onClick={() => { setMode('browse'); loadCards(); }} className="mt-4 rounded-xl bg-teal-600 px-5 py-2 text-sm font-medium text-white">
              返回
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-xs text-stone-400">
              <span>{currentIdx + 1} / {cards.length}</span>
              <div className="h-1 w-32 rounded-full bg-stone-100">
                <div className="h-1 rounded-full bg-teal-500 transition-all" style={{ width: `${((currentIdx + 1) / cards.length) * 100}%` }} />
              </div>
            </div>

            {/* Card */}
            <div onClick={() => { if (!flipped) { setFlipped(true); setReviewStart(Date.now()); } }}
              className={`min-h-52 cursor-pointer rounded-2xl border-2 p-6 text-center transition-all ${flipped ? 'border-teal-400 bg-teal-50' : 'border-stone-200 bg-white hover:border-teal-300'}`}>
              <div className="text-xs font-medium uppercase tracking-widest text-stone-400 mb-4">
                {flipped ? '答案' : '问题'}
              </div>
              <div className="text-lg font-medium text-stone-800 leading-relaxed">
                {flipped ? current!.back : current!.front}
              </div>
              {!flipped && (
                <div className="mt-6 text-sm text-stone-400">👆 点击查看答案</div>
              )}
            </div>

            {/* Rating */}
            {flipped && (
              <div className="flex gap-2 flex-wrap">
                {RATING_LABELS.map(r => (
                  <button key={r.q} onClick={() => rate(r.q)}
                    className={`flex-1 rounded-xl border py-3 text-sm font-medium transition ${r.color}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* Browse mode */}
      {mode === 'browse' && !showForm && (
        loading ? <div className="py-12 text-center text-stone-400">加载中...</div>
        : cards.length === 0 ? (
          <div className="py-12 text-center text-stone-400">还没有闪卡，创建一个开始学习吧！</div>
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <div key={card.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-700">{card.front}</div>
                    <div className="mt-1 text-sm text-stone-400">{card.back}</div>
                    {card.tags && <div className="mt-1.5 flex gap-1.5 flex-wrap">
                      {card.tags.split(',').filter(Boolean).map(t => (
                        <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">{t.trim()}</span>
                      ))}
                    </div>}
                  </div>
                  {card.course_title && <span className="text-xs text-stone-400">{card.course_title}</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function FlashcardForm({ onCreated }: { onCreated: () => void }) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!front.trim() || !back.trim() || saving) return;
    setSaving(true);
    await fetch('/api/self-study/flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ front: front.trim(), back: back.trim(), tags: tags.trim() }),
    });
    setFront(''); setBack(''); setTags(''); setSaving(false);
    onCreated();
  };

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 space-y-3">
      <div className="text-sm font-bold text-violet-700">新建闪卡</div>
      <input value={front} onChange={e => setFront(e.target.value)} placeholder="问题 / 概念（正面）"
        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
      <textarea value={back} onChange={e => setBack(e.target.value)} placeholder="答案 / 解释（背面）"
        rows={2} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
      <input value={tags} onChange={e => setTags(e.target.value)} placeholder="标签（逗号分隔，可选）"
        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus:border-violet-400 focus:outline-none" />
      <button onClick={submit} disabled={saving || !front.trim() || !back.trim()}
        className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
        {saving ? '保存中...' : '保存闪卡'}
      </button>
    </div>
  );
}