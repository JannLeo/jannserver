'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import { format } from 'date-fns';

function formatDate(iso: string): string {
  try { return format(new Date(iso), 'MM-dd HH:mm'); } catch { return iso; }
}

export default function MemosPage() {
  const [memos, setMemos] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [showNew, setShowNew] = useState(false);
  const router = useRouter();

  const fetchMemos = async () => {
    const res = await fetch('/api/memos');
    setMemos(await res.json());
  };

  useEffect(() => { fetchMemos(); }, []);

  const handleCreate = async () => {
    if (!content.trim()) return;
    await fetch('/api/memos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    setContent('');
    setShowNew(false);
    fetchMemos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return;
    await fetch('/api/memos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    fetchMemos();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="📋 备忘录" />
      <main className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <button onClick={() => setShowNew(!showNew)} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">{showNew ? '关闭' : '+ 新建'}</button>
        </div>
        {showNew && (
          <div className="mb-6 bg-white rounded-xl p-4 border border-slate-200">
            <textarea className="w-full min-h-[120px] border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="记录临时想法、测试现象、bug 分析..." value={content} onChange={e => setContent(e.target.value)} />
            <button onClick={handleCreate} className="mt-2 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">保存</button>
          </div>
        )}

        <div className="space-y-3">
          {memos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-5xl mb-3">💡</div>
              <p className="text-slate-400 font-medium">还没有备忘</p>
              <p className="text-slate-300 text-sm mt-1">点击上方的"+ 新建"开始记录</p>
            </div>
          ) : memos.map(m => (
            <div key={m.id} className="bg-white rounded-xl p-5 border border-slate-100 hover:border-blue-200 hover:shadow-md hover:shadow-blue-50 transition-all duration-200 group">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm">💡</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-3">{m.excerpt || m.content || '(空)'}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-slate-400">{formatDate(m.createdAt)}</span>
                  </div>
                </div>
                <button onClick={() => handleDelete(m.id)} className="text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">删除</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}