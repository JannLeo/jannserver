'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [filter, setFilter] = useState('all');
  const router = useRouter();

  const fetchTasks = async () => {
    const res = await fetch(filter === 'today' ? '/api/tasks?date=today' : filter === 'done' ? '/api/tasks?status=done' : '/api/tasks');
    const data = await res.json();
    setTasks(data);
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
          {tasks.map(t => {
            const projectName = getProjectName(t.projectId);
            return (
            <div key={t.id} className="bg-white rounded-lg px-4 py-3 border border-slate-100 flex items-center gap-3">
              <button onClick={() => handleStatus(t.id, t.status)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${t.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300'}`}>
                {t.status === 'done' && '✓'}
              </button>
              <span className={`flex-1 ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>{t.title}</span>
              <span className="text-xs text-slate-400">{t.priority === 'high' ? '🔥' : t.priority === 'medium' ? '📌' : '💤'}</span>
              {projectName && <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded">{projectName}</span>}
              <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
            </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}