'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchTasks = async () => {
    setLoading(true);
    const res = await fetch('/api/tasks');
    const data = await res.json();
    if (Array.isArray(data)) setTasks(data);
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) { setNewTitle(''); fetchTasks(); }
  };

  const handleStatus = async (id: string, status: string) => {
    const newStatus = status === 'done' ? 'todo' : 'done';
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const filtered = filter === 'done' ? tasks.filter(t => t.status === 'done')
    : filter === 'todo' ? tasks.filter(t => t.status !== 'done')
    : tasks;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-stone-900/10 bg-[#fffaf1]/70 shadow-[0_30px_90px_rgba(39,32,24,0.10)] backdrop-blur-xl">
      <NavBar title="任务" />
      <div className="flex flex-1 flex-col overflow-hidden bg-gradient-to-b from-teal-50/30 to-white/80">
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="mb-6 flex gap-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="添加新任务，回车确认…"
              className="flex-1 rounded-2xl border border-stone-200 bg-white/70 px-4 py-2.5 text-sm text-stone-700 shadow-sm placeholder-stone-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <button onClick={handleCreate}
              className="rounded-2xl bg-[#173f3c] px-5 py-2.5 text-sm font-bold text-amber-100 shadow-sm hover:bg-[#0f3d3a]">
              添加
            </button>
          </div>
          <div className="mb-4 flex gap-2">
            {[['all', '全部'], ['todo', '待完成'], ['done', '已完成']].map(([v, label]) => (
              <button key={v}
                onClick={() => setFilter(v)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${filter === v ? 'bg-[#173f3c] text-amber-100' : 'bg-white/60 text-stone-500 hover:bg-white/90'}`}>
                {label}
              </button>
            ))}
            <span className="ml-auto flex items-center text-xs text-stone-400">{filtered.length} 个任务</span>
          </div>
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-stone-400">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-stone-400">
                <p className="text-4xl mb-2">📋</p>
                <p className="text-sm">{filter === 'done' ? '暂无已完成任务' : '还没有任务'}</p>
              </div>
            ) : filtered.map(t => (
              <div key={t.id} className="app-card px-4 py-3 hover:border-teal-500/30 hover:shadow-sm transition-all duration-200 flex items-center gap-3 group">
                <button onClick={() => handleStatus(t.id, t.status)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs flex-shrink-0 transition-all ${t.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-stone-300 hover:border-teal-500/60'}`}>
                  {t.status === 'done' && '✓'}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${t.status === 'done' ? 'line-through text-stone-400' : 'text-stone-700'}`}>{t.title}</div>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${t.priority === 'high' ? 'bg-red-50 text-red-600 border border-red-200' : t.priority === 'medium' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>
                  {t.priority === 'high' ? '高' : t.priority === 'medium' ? '中' : '低'}
                </span>
                <button onClick={() => handleDelete(t.id)} className="text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
