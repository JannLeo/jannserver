'use client';
import { useState, useEffect } from 'react';
import NavBar from '@/components/NavBar';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const doFetch = async () => {
    const res = await fetch('/api/projects');
    setProjects(await res.json());
  };

  useEffect(() => { doFetch(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) });
    setNewName('');
    setShowNew(false);
    doFetch();
  };

  return (
    <div className="page-shell">
      <NavBar title="📁 项目" />
      <main className="page-container max-w-4xl">
        <div className="mb-6">
          <button onClick={() => setShowNew(!showNew)} className="app-button-primary px-4 py-2 rounded-lg text-sm">+ 新建项目</button>
        </div>
        {showNew && (
          <div className="mb-6 app-card p-4 flex gap-2">
            <input className="flex-1 app-input rounded-lg px-4 py-2 text-sm focus:outline-none"
              placeholder="项目名称" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            <button onClick={handleCreate} className="app-button-primary px-4 py-2 rounded-lg text-sm">创建</button>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map(p => (
            <article key={p.id} className="app-card p-5 transition">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-medium">{p.name}</span>
              </div>
              {p.description && <p className="text-sm text-slate-500 mt-1">{p.description}</p>}
              <p className="text-xs text-slate-400 mt-3">项目详情页尚未启用，先在任务/笔记中按项目使用。</p>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}