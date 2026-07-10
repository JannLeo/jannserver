'use client';
import { useState, useEffect, useCallback } from 'react';
import NavBar from '@/components/NavBar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ─── Knowledge Tabs ─────────────────────────────────────────────────────────── */
type Tab = 'repos' | 'code' | 'projects' | 'wiki';
const TAB_LABELS: Record<Tab, { icon: string; label: string }> = {
  repos: { icon: '📚', label: '文档' },
  code: { icon: '💻', label: '代码' },
  projects: { icon: '📁', label: '项目' },
  wiki: { icon: '📖', label: 'Wiki' },
};

interface Repo { id: number; name: string; description: string; stars: number; language: string; repo_url: string; }
interface CodeResult { repo: string; filename: string; content: string; }
interface WikiEntry { id: string; title: string; content: string; }

/* Repos Tab */
function ReposTab({ onSelect }: { onSelect: (q: string) => void }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/repos').then(r => r.json()).then(d => {
      setRepos(Array.isArray(d) ? d : (d.repos || []));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = query ? repos.filter(r => r.name.toLowerCase().includes(query.toLowerCase()) || (r.description || '').toLowerCase().includes(query.toLowerCase())) : repos;

  return (
    <div className="space-y-2">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索文档..."
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs focus:border-amber-400 focus:outline-none" />
      {loading ? <div className="text-xs text-slate-400">加载中...</div> :
       filtered.length === 0 ? <div className="text-xs text-slate-400">暂无文档</div> :
       <div className="space-y-1.5 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
         {filtered.map(r => (
           <div key={r.id} onClick={() => onSelect(r.name)}
             className="rounded-xl border border-stone-200 bg-white p-3 cursor-pointer transition hover:border-amber-300 hover:shadow-sm">
             <div className="flex items-center gap-2">
               <span className="font-bold text-xs truncate">{r.name}</span>
               <span className="text-[10px] text-slate-400 shrink-0">★ {r.stars}</span>
             </div>
             <p className="mt-1 text-[10px] text-slate-500 line-clamp-2">{r.description || '无描述'}</p>
           </div>
         ))}
       </div>
      }
    </div>
  );
}

/* Code Tab */
function CodeTab({ onSelect }: { onSelect: (q: string) => void }) {
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
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="搜索代码..." className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs focus:border-amber-400 focus:outline-none" />
        <button onClick={search} className="shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-bold text-[#173f3c] hover:bg-amber-200">搜索</button>
      </div>
      {loading ? <div className="text-xs text-slate-400">搜索中...</div> : results.length === 0 ? (
        <div className="text-xs text-slate-400">输入关键词搜索代码</div>
      ) : (
        <div className="space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
          {results.map((r, i) => (
            <div key={i} onClick={() => onSelect(query)}
              className="rounded-xl border border-stone-200 bg-white p-2 cursor-pointer transition hover:border-amber-300">
              <div className="text-[10px] font-mono text-slate-500">{r.repo} / {r.filename}</div>
              <div className="mt-1 text-[10px] text-slate-700 line-clamp-2 font-mono">{r.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Projects Tab */
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
    <div className="space-y-1.5 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
      {loading ? <div className="text-xs text-slate-400">加载中...</div> :
       repos.length === 0 ? <div className="text-xs text-slate-400">暂无项目</div> :
       repos.map(r => (
         <div key={r.id}
           className="rounded-xl border border-stone-200 bg-white p-3 transition hover:border-amber-300">
           <div className="flex items-center justify-between">
             <span className="font-bold text-xs">{r.name}</span>
             <span className="text-[10px] text-slate-400">★ {r.stars ?? 0}</span>
           </div>
           <p className="mt-1 text-[10px] text-slate-500 line-clamp-2">{r.description || r.url || '无描述'}</p>
         </div>
       ))}
    </div>
  );
}

/* Wiki Tab */
function WikiTab({ onSelect }: { onSelect: (q: string) => void }) {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [query, setQuery] = useState('');

  const search = async () => {
    if (!query.trim()) { setEntries([]); return; }
    const r = await fetch(`/api/wiki/search?q=${encodeURIComponent(query)}`);
    const d = await r.json();
    setEntries(Array.isArray(d) ? d.slice(0, 10) : []);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="搜索 Wiki..." className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs focus:border-amber-400 focus:outline-none" />
        <button onClick={search} className="shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-bold text-[#173f3c] hover:bg-amber-200">搜索</button>
      </div>
      {entries.length === 0 ? <div className="text-xs text-slate-400">输入关键词搜索 Wiki</div> :
       <div className="space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
         {entries.map(e => (
           <div key={e.id} onClick={() => onSelect(e.title)}
             className="rounded-xl border border-stone-200 bg-white p-2 cursor-pointer transition hover:border-amber-300">
             <div className="font-bold text-xs">{e.title}</div>
             <div className="mt-1 text-[10px] text-slate-600 line-clamp-2">{e.content}</div>
           </div>
         ))}
       </div>
      }
    </div>
  );
}

/* ─── AI Q&A ─────────────────────────────────────────────────────────────────── */
interface Source { docType: string; docId?: string; title: string; repoName?: string; url?: string; }
interface AskResult { answer: string; sources: Source[]; configured: boolean; usedKnowledgeBase?: boolean; error?: string; }

function getTypeIcon(docType: string): string {
  const icons: Record<string, string> = { note: '📝', memo: '📋', daily: '📅', github_md: '📄', repo: '📦' };
  return icons[docType] || '📄';
}
function getTypeLabel(docType: string): string {
  const labels: Record<string, string> = { note: '笔记', memo: '备忘录', daily: '日报', github_md: 'GitHub 文档', repo: '仓库' };
  return labels[docType] || docType;
}

/* ─── Combined Page ───────────────────────────────────────────────────────────── */
export default function KnowledgeAskPage() {
  const [tab, setTab] = useState<Tab>('repos');
  const [question, setQuestion] = useState('');
  const [repoName, setRepoName] = useState('全部仓库');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, repoName }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.configured === false) setResult({ answer: '', sources: [], configured: false, error: data.error || 'AI 未配置' });
        else setError(data.error || `请求失败 (${res.status})`);
        return;
      }
      setResult(data);
    } catch (err: any) {
      setError(`网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [question, repoName]);

  const sendToAsk = (q: string) => {
    setQuestion(q);
    // Switch to right panel focus (no auto-ask, just fill)
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  };

  return (
    <div className="page-shell">
      <NavBar title="📚 知识问答" />

      <div className="flex flex-col lg:flex-row gap-3 p-4 h-[calc(100vh-7rem)] overflow-hidden">
        {/* ── Left: Knowledge Browser ── */}
        <div className="lg:w-1/2 flex flex-col min-h-0 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          {/* Left Header */}
          <div className="flex-shrink-0 border-b border-stone-100 bg-[#fffaf1]/80 p-3">
            <h2 className="text-sm font-black text-[#173f3c] tracking-[-0.02em]">📚 知识库</h2>
            <p className="text-[10px] text-slate-400">文档 · 代码 · 项目 · Wiki</p>
          </div>

          {/* Tabs */}
          <div className="flex-shrink-0 flex gap-1 p-2 border-b border-stone-100 bg-slate-50/50">
            {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all ${
                  tab === t ? 'bg-amber-100 text-[#173f3c]' : 'text-slate-500 hover:bg-slate-100'
                }`}>
                <span>{TAB_LABELS[t].icon}</span>
                <span>{TAB_LABELS[t].label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-0 overflow-hidden p-3">
            {tab === 'repos' && <ReposTab onSelect={sendToAsk} />}
            {tab === 'code' && <CodeTab onSelect={sendToAsk} />}
            {tab === 'projects' && <ProjectsTab />}
            {tab === 'wiki' && <WikiTab onSelect={sendToAsk} />}
          </div>
        </div>

        {/* ── Right: AI Q&A ── */}
        <div className="lg:w-1/2 flex flex-col min-h-0 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          {/* Right Header */}
          <div className="flex-shrink-0 border-b border-stone-100 bg-[#fffaf1]/80 p-3">
            <h2 className="text-sm font-black text-[#173f3c] tracking-[-0.02em]">🤖 AI 问答</h2>
            <p className="text-[10px] text-slate-400">基于知识库的智能回答</p>
          </div>

          {/* Repo Selector */}
          <div className="flex-shrink-0 border-b border-stone-100 p-2 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-500 shrink-0">知识库：</label>
              <select value={repoName} onChange={e => setRepoName(e.target.value)}
                className="flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs focus:border-amber-400 focus:outline-none"
                disabled={loading}>
                <option value="全部仓库">全部仓库</option>
                <option value="teach">teach</option>
                <option value="worldquant">worldquant</option>
                <option value="summary-for-work">summary-for-work</option>
              </select>
            </div>
          </div>

          {/* Q&A Scrollable Area */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {/* Not Configured */}
            {result && !result.configured && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                <p className="text-2xl mb-1">⚙️</p>
                <p className="text-yellow-700 text-xs font-medium">{result.error}</p>
                <p className="text-[10px] text-yellow-600 mt-1">请配置 AI 环境变量后重试</p>
              </div>
            )}

            {/* Error */}
            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3"><p className="text-red-700 text-xs">{error}</p></div>}

            {/* Loading */}
            {loading && <div className="text-center py-6"><p className="text-slate-400 text-xs animate-pulse">正在搜索知识库并生成回答...</p></div>}

            {/* Warn if no KB hit */}
            {result && result.configured && result.usedKnowledgeBase === false && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-[11px] text-amber-700">⚠️ 未命中知识库，以下为通用 AI 回答</div>
            )}

            {/* Answer */}
            {result && result.configured && result.answer && (
              <>
                <div className="rounded-xl border border-stone-100 p-3">
                  <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">回答</h3>
                  <div className="text-xs text-slate-700 leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown></div>
                </div>

                {/* Sources */}
                {result.sources.length > 0 && (
                  <div className="rounded-xl border border-stone-100 p-3">
                    <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">参考来源 ({result.sources.length})</h3>
                    <div className="space-y-1.5">
                      {result.sources.map((source, i) =>
                        source.url ? (
                          <a key={i} href={source.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                            <span className="text-sm mt-0.5">{getTypeIcon(source.docType)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-800 truncate">{source.title || '无标题'}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5 space-x-1">
                                <span className="bg-slate-100 px-1 py-0.5 rounded">{getTypeLabel(source.docType)}</span>
                                {source.repoName && <span className="bg-teal-50 text-teal-700 px-1 py-0.5 rounded">{source.repoName}</span>}
                              </div>
                            </div>
                            <span className="text-slate-300 text-xs mt-1">↗</span>
                          </a>
                        ) : (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 opacity-60">
                            <span className="text-sm mt-0.5">{getTypeIcon(source.docType)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-800 truncate">{source.title || '无标题'}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5 space-x-1">
                                <span className="bg-slate-100 px-1 py-0.5 rounded">{getTypeLabel(source.docType)}</span>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Empty state */}
            {!result && !loading && !error && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-3xl mb-2">🤖</p>
                <p className="text-slate-400 text-xs">在左侧知识库点击内容<br/>或在此输入问题开始问答</p>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-stone-100 p-2 bg-slate-50/50">
            <div className="flex gap-1.5">
              <input
                type="text" value={question} onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题..."
                className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs focus:border-amber-400 focus:outline-none"
                disabled={loading}
              />
              <button onClick={handleAsk} disabled={loading || !question.trim()}
                className="shrink-0 rounded-xl bg-[#173f3c] px-4 py-2 text-xs font-bold text-white hover:bg-[#0f3d3a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {loading ? '查询中...' : '提问'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}