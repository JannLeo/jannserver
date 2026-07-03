'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

export default function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/notes').then(r => r.json()).then(data => { setNotes(data); setLoading(false); });
  }, []);

  const handleDelete = async (slug: string) => {
    if (!confirm('确定删除？')) return;
    await fetch('/api/notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
    setNotes(prev => prev.filter(n => n.slug !== slug));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="📝 知识库" />
      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <Link href="/notes/new" className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600">+ 新建笔记</Link>
        </div>
        {loading ? <p className="text-slate-400">加载中...</p> : (
          <div className="grid gap-4">
            {notes.length === 0 && <p className="text-slate-400 text-center py-10">暂无笔记</p>}
            {notes.map(n => (
              <div key={n.id} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex justify-between items-start">
                <div>
                  <Link href={`/notes/${n.slug}`} className="text-blue-600 hover:underline font-medium">{n.title}</Link>
                  {n.excerpt && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{n.excerpt}</p>}
                  <span className="text-xs text-slate-400 mt-1 block">{n.createdAt}</span>
                </div>
                <button onClick={() => handleDelete(n.slug)} className="text-red-400 hover:text-red-600 text-sm">删除</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}