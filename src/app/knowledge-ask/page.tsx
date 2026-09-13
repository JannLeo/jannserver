'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
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
       <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
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
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
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
    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
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
       <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
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

/* ─── GPT-Style Single-Column Page ───────────────────────────────────────────── */
export default function KnowledgeAskPage() {
  const [tab, setTab] = useState<Tab | null>(null);          // null = 纯聊天模式
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');                    // 最近发送的问题（气泡）
  const [repoName, setRepoName] = useState('全部仓库');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAsked(q);
    setQuestion('');
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
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [asked, result, loading, error]);

  return (
    <div className="page-shell">
      <NavBar title="📚 知识问答" />

      <div className="flex flex-col h-[calc(100vh-7rem)] p-3 sm:p-4 max-w-3xl mx-auto gap-2">
        {/* ── Top: horizontal tab bar ── */}
        <div className="flex-shrink-0 flex items-center gap-1 p-1.5 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-x-auto">
          {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(tab === t ? null : t)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                tab === t ? 'bg-[#173f3c] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
              }`}>
              <span>{TAB_LABELS[t].icon}</span>
              <span>{TAB_LABELS[t].label}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 pl-2 border-l border-stone-100 shrink-0">
            <label className="text-[11px] font-medium text-slate-500 hidden sm:inline">知识库</label>
            <select value={repoName} onChange={e => setRepoName(e.target.value)}
              className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs focus:border-amber-400 focus:outline-none"
              disabled={loading}>
              <option value="全部仓库">全部仓库</option>
              <option value="teach">teach</option>
              <option value="worldquant">worldquant</option>
              <option value="summary-for-work">summary-for-work</option>
            </select>
          </div>
        </div>

        {/* ── Main chat card ── */}
        <div className="flex-1 min-h-0 rounded-2xl border border-stone-200 bg-white shadow-sm flex flex-col overflow-hidden">
          {/* Knowledge panel (slides in when a tab is active) */}
          {tab && (
            <div className="flex-shrink-0 max-h-[38vh] overflow-y-auto border-b border-stone-100 bg-[#faf9f6]/80 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500">{TAB_LABELS[tab].icon} {TAB_LABELS[tab].label} · 点击条目填入问题</span>
                <button onClick={() => setTab(null)} className="text-[11px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded-lg hover:bg-slate-100">✕ 收起</button>
              </div>
              {tab === 'repos' && <ReposTab onSelect={sendToAsk} />}
              {tab === 'code' && <CodeTab onSelect={sendToAsk} />}
              {tab === 'projects' && <ProjectsTab />}
              {tab === 'wiki' && <WikiTab onSelect={sendToAsk} />}
            </div>
          )}

          {/* Chat scroll area */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {/* User question bubble */}
            {asked && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#173f3c] text-white px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                  {asked}
                </div>
              </div>
            )}

            {/* Not Configured */}
            {result && !result.configured && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-yellow-50 border border-yellow-200 rounded-2xl rounded-bl-md p-4 text-center">
                  <p className="text-2xl mb-1">⚙️</p>
                  <p className="text-yellow-700 text-xs font-medium">{result.error}</p>
                  <p className="text-[10px] text-yellow-600 mt-1">请配置 AI 环境变量后重试</p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-red-50 border border-red-200 rounded-2xl rounded-bl-md p-3">
                  <p className="text-red-700 text-xs">⚠️ {error}</p>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-stone-100 bg-slate-50 px-4 py-3">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:300ms]" />
                  <span className="text-xs text-slate-400 ml-1">正在搜索知识库并生成回答...</span>
                </div>
              </div>
            )}

            {/* Warn if no KB hit */}
            {result && result.configured && result.usedKnowledgeBase === false && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-700">⚠️ 未命中知识库，以下为通用 AI 回答</div>
              </div>
            )}

            {/* Answer */}
            {result && result.configured && result.answer && (
              <div className="flex justify-start">
                <div className="max-w-[85%] min-w-0">
                  <div className="rounded-2xl rounded-bl-md border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-6 h-6 rounded-full bg-[#173f3c] text-white flex items-center justify-center text-xs">🤖</span>
                      <span className="text-[11px] font-semibold text-slate-500">AI 回答</span>
                    </div>
                    <div className="text-sm text-slate-700 leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown></div>
                  </div>

                  {/* Sources */}
                  {result.sources.length > 0 && (
                    <div className="mt-2 rounded-2xl border border-stone-100 bg-slate-50/70 p-3">
                      <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">📎 参考来源 ({result.sources.length})</h3>
                      <div className="space-y-1">
                        {result.sources.map((source, i) =>
                          source.url ? (
                            <a key={i} href={source.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-white transition-colors">
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
                            <div key={i} className="flex items-start gap-2 p-1.5 rounded-lg opacity-60">
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
                </div>
              </div>
            )}

            {/* Empty state */}
            {!asked && !result && !loading && !error && (
              <div className="flex flex-col items-center justify-center h-full min-h-[40vh] text-center">
                <div className="w-16 h-16 rounded-3xl bg-[#173f3c] text-white flex items-center justify-center text-3xl mb-3 shadow-lg">💬</div>
                <p className="text-slate-700 font-bold text-sm mb-1">知识库 AI 问答</p>
                <p className="text-slate-400 text-xs max-w-xs leading-relaxed">点击上方标签浏览知识库，<br/>或直接输入问题开始对话</p>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-stone-100 p-3 bg-white">
            <div className="flex gap-2 items-end">
              <input
                ref={inputRef}
                type="text" value={question} onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题，回车发送..."
                className="flex-1 rounded-xl border border-stone-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-amber-400 focus:bg-white focus:outline-none transition-colors"
                disabled={loading}
              />
              <button onClick={handleAsk} disabled={loading || !question.trim()}
                className="shrink-0 rounded-xl bg-[#173f3c] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0f3d3a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {loading ? '查询中...' : '提问 ➤'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
