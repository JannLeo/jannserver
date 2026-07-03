'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';

export default function DailyPage() {
  const router = useRouter();
  const params = useParams();
  const date = params.date as string || format(new Date(), 'yyyy-MM-dd');

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchDaily = async () => {
    const res = await fetch(`/api/daily/${date}`);
    const data = await res.json();
    setContent(data.content || '');
    setLoading(false);
  };

  useEffect(() => { fetchDaily(); }, [date]);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/daily/${date}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    setSaving(false);
  };

  if (loading) return <div className="p-6 text-slate-400">加载中...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">📅 {date}</h1>
        <div className="flex gap-2">
          <input type="date" value={date} onChange={e => router.push(`/daily/${e.target.value}`)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={handleSave} disabled={saving} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        <textarea className="w-full h-[70vh] border border-slate-200 rounded-xl p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={content} onChange={e => setContent(e.target.value)} />
      </main>
    </div>
  );
}