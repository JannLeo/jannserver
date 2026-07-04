'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

const GENRES = ['都市', '玄幻', '仙侠', '科幻', '历史', '游戏', '悬疑', '都市异能', '穿越', '轻小说'];

function phaseLabel(p: string) {
  return { setup: '📝 设定', outline: '🗺️ 纲', draft: '✍️ 写作', review: '🔍 评审', archive: '📚 归档' }[p] || p;
}

function phaseColor(p: string) {
  return { setup: 'bg-teal-50 text-teal-700 border-teal-200',
    outline: 'bg-purple-50 text-purple-600 border-purple-200',
    draft: 'bg-green-50 text-green-600 border-green-200',
    review: 'bg-amber-50 text-amber-600 border-amber-200',
    archive: 'bg-slate-50 text-slate-500 border-slate-200' }[p] || '';
}

export default function NovelsPage() {
  const [novels, setNovels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', genre: '都市', wordCountTarget: '300000' });

  const fetchNovels = async () => {
    setLoading(true);
    const res = await fetch('/api/novels');
    setNovels(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchNovels(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    const res = await fetch('/api/novels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowCreate(false);
      setForm({ title: '', genre: '都市', wordCountTarget: '300000' });
      fetchNovels();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这本小说？所有章节和设定都将删除。')) return;
    await fetch(`/api/novels/${id}`, { method: 'DELETE' });
    fetchNovels();
  };

  return (
    <div className="page-shell">
      <NavBar title="✍️ AI小说创作" />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-800">我的小说</h1>
            <p className="text-sm text-slate-400 mt-0.5">基于 awesome-novel 多智能体写作工作流</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 app-button-primary rounded-lg text-sm font-medium shadow-sm"
          >
            + 新建小说
          </button>
        </div>

        {/* Agent Pipeline Banner */}
        <div className="app-card p-4 mb-6 overflow-x-auto">
          <div className="text-xs text-slate-400 mb-2 font-medium">8 Agent 写作流水线</div>
          <div className="flex items-center gap-1 min-w-max">
            {[
              { icon: '🗺️', name: '总指挥', desc: 'novel-agent', color: 'bg-teal-50 border-teal-100' },
              { icon: '📝', name: '设定写入', desc: 'updater', color: 'bg-violet-50 border-violet-100' },
              { icon: '📖', name: '卷纲规划', desc: 'volume-planner', color: 'bg-purple-50 border-purple-100' },
              { icon: '📑', name: '章纲规划', desc: 'chapter-planner', color: 'bg-fuchsia-50 border-fuchsia-100' },
              { icon: '💡', name: '提示词', desc: 'prompt-crafter', color: 'bg-pink-50 border-pink-100' },
              { icon: '✍️', name: '正文写作', desc: 'writer', color: 'bg-green-50 border-green-100' },
              { icon: '🧹', name: '去AI味', desc: 'anti-ai', color: 'bg-amber-50 border-amber-100' },
              { icon: '🔍', name: '深度评审', desc: 'reader', color: 'bg-orange-50 border-orange-100' },
            ].map((agent, i) => (
              <div key={agent.desc} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${agent.color}`}>
                  <span>{agent.icon}</span>
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-700">{agent.name}</span>
                    <span className="text-slate-400 text-[10px] font-mono">{agent.desc}</span>
                  </div>
                </div>
                {i < 7 && <span className="mx-0.5 text-slate-300 text-xs">›</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Novel List */}
        {loading ? (
          <div className="text-center py-20 text-slate-400">加载中...</div>
        ) : novels.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="text-5xl mb-3">✍️</div>
            <p className="text-slate-400 font-medium">还没有小说</p>
            <p className="text-slate-300 text-sm mt-1">点击右上角「新建小说」开始创作</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {novels.map(n => (
              <div key={n.id} className="app-card overflow-hidden hover:border-teal-200 hover:shadow-md transition-all">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Link href={`/novel/${n.id}`} className="text-base font-bold text-slate-800 hover:text-teal-700 transition-colors">
                      {n.title || '未命名'}
                    </Link>
                    <button onClick={() => handleDelete(n.id)} className="text-slate-300 hover:text-red-400 text-sm flex-shrink-0">✕</button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                    {n.author && <span>{n.author}</span>}
                    {n.author && n.genre && <span>·</span>}
                    {n.genre && <span>{n.genre}</span>}
                    {n.genre && <span>·</span>}
                    <span>目标 {Number(n.wordCountTarget || 0).toLocaleString()} 字</span>
                  </div>
                  {n.synopsis && <p className="text-xs text-slate-500 line-clamp-2 mb-3">{n.synopsis}</p>}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${phaseColor(n.currentPhase)}`}>
                      {phaseLabel(n.currentPhase)}
                    </span>
                    <span className="text-xs text-slate-400">{n.totalWords?.toLocaleString() || 0} / {Number(n.wordCountTarget || 0).toLocaleString()} 字</span>
                  </div>
                  {/* Word count bar */}
                  <div className="mt-2 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#173f3c] to-teal-600 rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((n.totalWords || 0) / Number(n.wordCountTarget || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
                <Link
                  href={`/novel/${n.id}`}
                  className="block w-full py-2.5 text-center text-xs font-medium text-white bg-gradient-to-r from-[#173f3c] to-teal-700 transition-colors"
                >
                  打开写作台 →
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="app-card shadow-[0_30px_90px_rgba(39,32,24,0.18)] max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">新建小说</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">小说名称</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="例如：修仙长生传"
                  className="w-full app-input rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">题材类型</label>
                <select
                  value={form.genre}
                  onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}
                  className="w-full app-input rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">目标字数</label>
                <input
                  type="number"
                  value={form.wordCountTarget}
                  onChange={e => setForm(f => ({ ...f, wordCountTarget: e.target.value }))}
                  className="w-full app-input rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 px-4 py-2 app-button-primary rounded-lg text-sm font-medium"
              >
                创建并开始写作
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 app-button-secondary rounded-lg text-sm hover:bg-slate-50">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}