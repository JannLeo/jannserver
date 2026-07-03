'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">📁 项目</h1>
        <button onClick={() => setShowNew(!showNew)} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">+ 新建项目</button>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        {showNew && (
          <div className="mb-6 bg-white rounded-xl p-4 border border-slate-200 flex gap-2">
            <input className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="项目名称" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            <button onClick={handleCreate} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">创建</button>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map(p => (
            <Link key={p.id} href={`/projects/${p.id}`}
              className="bg-white rounded-xl p-5 border border-slate-100 hover:border-blue-200 hover:shadow-sm transition block">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-medium">{p.name}</span>
              </div>
              {p.description && <p className="text-sm text-slate-500 mt-1">{p.description}</p>}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}