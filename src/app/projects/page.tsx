'use client';
import { useState, useEffect } from 'react';
import NavBar from '@/components/NavBar';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const doFetch = async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    // Enrich with stats if available
    setProjects(data);
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
      <main className="max-w-4xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-700">我的项目</h2>
          <button onClick={() => setShowNew(!showNew)} className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:from-indigo-600 hover:to-purple-600 shadow-sm">
            + 新建项目
          </button>
        </div>
        {showNew && (
          <div className="mb-6 bg-white rounded-xl p-4 border border-slate-200 flex gap-2 shadow-sm">
            <input className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="项目名称" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            <button onClick={handleCreate} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-600">创建</button>
          </div>
        )}
        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="text-5xl mb-3">📁</div>
            <p className="text-slate-400 font-medium">还没有项目</p>
            <p className="text-slate-300 text-sm mt-1">点击右上角「新建项目」开始</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="bg-white rounded-xl p-5 border border-slate-100 hover:border-indigo-200 hover:shadow-md transition block group">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || '#3b82f6' }} />
                  <span className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{p.name}</span>
                </div>
                {p.description && <p className="text-sm text-slate-500 mb-3">{p.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}