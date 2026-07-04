'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import { format } from 'date-fns';

function formatDate(iso: string): string {
  try { return format(new Date(iso), 'MM-dd HH:mm'); } catch { return iso; }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchTasks = async () => {
    setLoading(true);
    const res = await fetch(filter === 'today' ? '/api/tasks?date=today' : filter === 'done' ? '/api/tasks?status=done' : '/api/tasks');
    const data = await res.json();
    setTasks(data);
    setLoading(false);
  };

  const fetchProjects = async () => {
    const res = await fetch('/api/projects');
    setProjects(await res.json());
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    return projects.find(p => p.id === projectId)?.name || null;
  };

  useEffect(() => { fetchTasks(); fetchProjects(); }, [filter]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle }) });
    setNewTitle('');
    fetchTasks();
  };

  const handleStatus = async (id: string, status: string) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status === 'done' ? 'todo' : 'done' }),
    });
    fetchTasks();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="✅ 任务" />
      <main className="max-w-3xl mx-auto p-6">
        <div className="flex gap-2 mb-6">
          {['all', 'today', 'done'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {f === 'all' ? '全部' : f === 'today' ? '今日' : '已完成'}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-6">
          <input className="flex-1 border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="添加新任务..." value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <button onClick={handleCreate} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600">添加</button>
        </div>

        <div className="space-y-2">
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
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-slate-400 font-medium">
                {filter === 'today' ? '今日没有任何任务' : filter === 'done' ? '暂无已完成任务' : '还没有任务'}
              </p>
              <p className="text-slate-300 text-sm mt-1">
                {filter === 'all' ? '在上方输入框添加第一个任务' : '切换筛选条件看看其他任务'}
              </p>
            </div>
          ) : tasks.map(t => {
            const projectName = getProjectName(t.projectId);
            return (
            <div key={t.id} className="bg-white rounded-lg px-4 py-3 border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all duration-200 flex items-center gap-3 group">
              <button onClick={() => handleStatus(t.id, t.status)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs transition-all ${t.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-blue-400'}`}>
                {t.status === 'done' && '✓'}
              </button>
              <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-700'}`}>{t.title}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                t.priority === 'high'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : t.priority === 'medium'
                  ? 'bg-amber-50 text-amber-600 border border-amber-200'
                  : 'bg-slate-50 text-slate-400 border border-slate-200'
              }`}>
                {t.priority === 'high' ? '🔥 高' : t.priority === 'medium' ? '📌 中' : '💤 低'}
              </span>
              {projectName && <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded">{projectName}</span>}
              <button onClick={() => handleDelete(t.id)} className="text-slate-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}