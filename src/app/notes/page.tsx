'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import { format } from 'date-fns';

function formatDate(iso: string): string {
  try { return format(new Date(iso), 'MM-dd HH:mm'); } catch { return iso; }
}

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
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              加载中...
            </div>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-3">📝</div>
            <p className="text-slate-400 font-medium">还没有笔记</p>
            <p className="text-slate-300 text-sm mt-1">创建你的第一篇笔记吧</p>
            <Link href="/notes/new" className="mt-4 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition shadow-sm">
              创建笔记
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notes.map(n => (
              <div key={n.id} className="bg-white rounded-xl p-5 border border-slate-100 hover:border-blue-200 hover:shadow-md hover:shadow-blue-50 transition-all duration-200 flex justify-between items-start gap-3 group">
                <div className="min-w-0 flex-1">
                  <Link href={`/notes/${n.slug}`} className="text-blue-600 hover:underline font-medium block truncate">{n.title || '无标题'}</Link>
                  {n.excerpt && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{n.excerpt}</p>}
                  <span className="text-xs text-slate-400 mt-1.5 block">{formatDate(n.createdAt)}</span>
                </div>
                <button onClick={() => handleDelete(n.slug)} className="text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">删除</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}