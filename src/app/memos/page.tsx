'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

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
          {memos.length === 0 && <p className="text-slate-400 text-center py-10">暂无备忘录</p>}
          {memos.map(m => (
            <div key={m.id} className="bg-white rounded-xl p-4 border border-slate-100">
              <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-4">{m.excerpt || '(空)'}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-400">{m.createdAt}</span>
                <button onClick={() => handleDelete(m.id)} className="text-red-400 hover:text-red-600 text-xs">删除</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}