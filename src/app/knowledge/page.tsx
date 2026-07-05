'use client';
import { useState, useEffect } from 'react';

type Tab = 'repos' | 'code' | 'projects' | 'wiki';

const TAB_LABELS: Record<Tab, { icon: string; label: string; sublabel: string }> = {
  repos: { icon: '📚', label: '文档', sublabel: 'GitHub Repos' },
  code: { icon: '💻', label: '代码', sublabel: 'Code Search' },
  projects: { icon: '📁', label: '项目', sublabel: 'Projects' },
  wiki: { icon: '📖', label: 'Wiki', sublabel: 'LLM Wiki' },
};

interface Repo { id: number; name: string; description: string; stars: number; language: string; repo_url: string; updated_at: string; }
interface CodeResult { repo: string; filename: string; content: string; }
interface Project { id: string; name: string; description: string; status: string; updated_at: string; }
interface WikiEntry { id: string; title: string; content: string; }

function ReposTab() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/repos').then(r => r.json()).then(d => {
      setRepos(Array.isArray(d) ? d : (d.repos || []));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = query
    ? repos.filter(r => r.name.toLowerCase().includes(query.toLowerCase()) || (r.description || '').toLowerCase().includes(query.toLowerCase()))
    : repos;

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="搜索文档..."
        className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
      {loading ? (
        <div className="text-sm text-slate-400">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-slate-400">暂无文档</div>
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {filtered.map(r => (
            <a key={r.id} href={`/repos?q=${encodeURIComponent(r.name)}`} target="_blank" rel="noreferrer"
              className="block rounded-xl border border-stone-200 bg-white p-4 transition hover:border-amber-300 hover:shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm truncate">{r.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">★ {r.stars}</span>
                    {r.language && <span className="text-xs text-slate-400 shrink-0">{r.language}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{r.description || '无描述'}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CodeTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CodeResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/code?q=${encodeURIComponent(query)}&limit=10`);
      const d = await r.json();
      setResults(Array.isArray(d) ? d.slice(0, 10) : []);
    } catch { setResults([]); }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="搜索代码..."
          className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100" />
        <button onClick={search} className="shrink-0 rounded-xl bg-amber-100 px-4 py-2 text-sm font-bold text-[#173f3c] hover:bg-amber-200">搜索</button>
      </div>
      {loading ? <div className="text-sm text-slate-400">搜索中...</div> : results.length === 0 ? (
        <div className="text-sm text-slate-400">输入关键词搜索代码</div>
      ) : (
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {results.map((r, i) => (
            <a key={i} href={`/code?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer"
              className="block rounded-xl border border-stone-200 bg-white p-3 transition hover:border-amber-300">
              <div className="text-xs font-mono text-slate-500">{r.repo} / {r.filename}</div>
              <div className="mt-1 text-xs text-slate-700 line-clamp-2 font-mono">{r.content}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsTab() {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/repos').then(r => r.json()).then(d => {
      setRepos(Array.isArray(d) ? d : (d.repos || d.data || []));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-2">
      {loading ? <div className="text-sm text-slate-400">加载中...</div> :
       repos.length === 0 ? <div className="text-sm text-slate-400">暂无项目</div> : (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {repos.map(r => (
            <a key={r.id} href={`/code?repoId=${r.id}`} target="_blank" rel="noreferrer"
              className="block rounded-xl border border-stone-200 bg-white p-4 transition hover:border-amber-300 hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{r.name}</span>
                <span className="text-xs text-slate-400">★ {r.stars ?? 0}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">{r.description || r.url || '无描述'}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function WikiTab() {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [query, setQuery] = useState('');

  const search = async () => {
    if (!query.trim()) { setEntries([]); return; }
    const r = await fetch(`/api/wiki/search?q=${encodeURIComponent(query)}`);
    const d = await r.json();
    setEntries(Array.isArray(d) ? d.slice(0, 10) : []);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="搜索 Wiki..."
          className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100" />
        <button onClick={search} className="shrink-0 rounded-xl bg-amber-100 px-4 py-2 text-sm font-bold text-[#173f3c] hover:bg-amber-200">搜索</button>
      </div>
      {entries.length === 0 ? (
        <div className="text-sm text-slate-400">输入关键词搜索 Wiki</div>
      ) : (
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {entries.map(e => (
            <a key={e.id} href={`/wiki?q=${encodeURIComponent(e.title)}`} target="_blank" rel="noreferrer"
              className="block rounded-xl border border-stone-200 bg-white p-3 transition hover:border-amber-300">
              <div className="font-bold text-sm">{e.title}</div>
              <div className="mt-1 text-xs text-slate-600 line-clamp-2">{e.content}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>('repos');

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-[-0.02em] text-[#173f3c]">📚 知识库</h1>
        <p className="mt-1 text-sm text-slate-500">文档 · 代码 · 项目 · Wiki</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => {
          const { icon, label } = TAB_LABELS[t];
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)}
              className={
                'flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold transition-all ' +
                (active
                  ? 'bg-amber-100 text-[#173f3c] shadow-sm'
                  : 'bg-white text-slate-500 border border-stone-200 hover:border-amber-300 hover:text-slate-700')
              }>
              <span>{icon}</span><span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        {tab === 'repos' && <ReposTab />}
        {tab === 'code' && <CodeTab />}
        {tab === 'projects' && <ProjectsTab />}
        {tab === 'wiki' && <WikiTab />}
      </div>
    </div>
  );
}