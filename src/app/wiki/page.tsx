'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';

interface WikiSpace {
  id: number;
  name: string;
  description: string;
  sourceType: string;
  sourceId: number | null;
  pageCount: number;
}

interface WikiPageSummary {
  id: number;
  spaceId: number;
  slug: string;
  title: string;
  summary: string;
  tagsJson?: string;
  confidence: string;
  updatedAt: string;
}

interface WikiPageDetail extends WikiPageSummary {
  content: string;
  aliases: string[];
  tags: string[];
  sourceRefs: Array<{ docId: number | null; relPath: string; excerpt: string }>;
  backlinks: Array<{ id: number; fromPageId: number; linkText: string; title: string; unresolved: boolean }>;
  outgoingLinks: Array<{ id: number; toPageId: number | null; linkText: string; title: string; unresolved: boolean }>;
}

const WQ_CONCEPTS_FOR_COMPILE = [
  { slug: 'alpha', title: 'Alpha' },
  { slug: 'fitness', title: 'Fitness' },
  { slug: 'sharpe', title: 'Sharpe' },
  { slug: 'returns', title: 'Returns' },
  { slug: 'turnover', title: 'Turnover' },
  { slug: 'margin', title: 'Margin' },
  { slug: 'drawdown', title: 'Drawdown' },
  { slug: 'delay', title: 'Delay' },
  { slug: 'decay', title: 'Decay' },
  { slug: 'neutralization', title: 'Neutralization' },
  { slug: 'truncation', title: 'Truncation' },
  { slug: 'pasteurization', title: 'Pasteurization' },
  { slug: 'universe', title: 'Universe' },
  { slug: 'region', title: 'Region' },
  { slug: 'submission', title: 'Submission' },
  { slug: 'simulation', title: 'Simulation' },
  { slug: 'correlation', title: 'Correlation' },
  { slug: 'self-correlation', title: 'Self-correlation' },
];

function formatDate(s: string): string {
  if (!s) return '-';
  try {
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return s;
  }
}

function confidenceColor(c: string): string {
  if (c === 'high') return 'bg-green-100 text-green-700 border-green-200';
  if (c === 'medium') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

function parsePageType(tagsJson?: string): string {
  if (!tagsJson) return '';
  try {
    const tags: string[] = JSON.parse(tagsJson);
    const t = tags.find((x) => x.startsWith('pageType:'));
    return t ? t.split(':')[1] : '';
  } catch {
    return '';
  }
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  project_overview: 'Overview',
  module_summary: 'Module',
  feature_summary: 'Feature',
  config_summary: 'Config',
  commit_summary: 'Commit',
  code_symbol: 'Code',
  bug_history: 'Bug',
  decision_record: 'Decision',
  test_summary: 'Test',
  concept: 'Concept',
};

function pageTypeBadgeClass(pt: string): string {
  if (pt === 'project_overview') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (pt === 'module_summary') return 'bg-purple-50 text-purple-700 border-purple-200';
  if (pt === 'feature_summary') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (pt === 'config_summary') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (pt === 'commit_summary') return 'bg-teal-50 text-teal-700 border-teal-200';
  if (pt === 'bug_history') return 'bg-red-50 text-red-700 border-red-200';
  if (pt === 'decision_record') return 'bg-pink-50 text-pink-700 border-pink-200';
  if (pt === 'test_summary') return 'bg-cyan-50 text-cyan-700 border-cyan-200';
  if (pt === 'code_symbol') return 'bg-slate-50 text-slate-700 border-slate-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
}

export default function WikiPage() {
  const [spaces, setSpaces] = useState<WikiSpace[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<WikiSpace | null>(null);
  const [pages, setPages] = useState<WikiPageSummary[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [selectedPage, setSelectedPage] = useState<WikiPageDetail | null>(null);
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);

  // 编译状态
  const [compilingSlug, setCompilingSlug] = useState<string | null>(null);
  const [compileAllRunning, setCompileAllRunning] = useState(false);
  const [compileLog, setCompileLog] = useState<string[]>([]);
  const compileLogRef = useRef<HTMLDivElement>(null);

  const searchQRef = useRef('');
  const [searchInput, setSearchInput] = useState('');

  // 1. 加载 spaces
  const fetchSpaces = useCallback(async () => {
    setLoadingSpaces(true);
    try {
      const res = await fetch('/api/wiki/spaces');
      const data = await res.json();
      setSpaces(data.spaces || []);
    } catch (e) {
      console.error('fetchSpaces error:', e);
    } finally {
      setLoadingSpaces(false);
    }
  }, []);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  // 2. 深链：读 URL ?spaceId=&pageId=
  useEffect(() => {
    if (spaces.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('spaceId');
    const pid = params.get('pageId');
    if (sid) {
      const s = spaces.find((x) => String(x.id) === sid);
      if (s) {
        setSelectedSpace(s);
        if (pid) {
          // 延迟加载 page，等 pages 加载完
          setTimeout(() => loadPageDirect(Number(pid)), 300);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces]);

  // 3. selectedSpace 变 → fetch pages
  useEffect(() => {
    if (!selectedSpace) return;
    fetchPages(selectedSpace.id, '');
    setSearchInput('');
    searchQRef.current = '';
    setSelectedPage(null);
  }, [selectedSpace]);

  // 4. 搜索防抖
  useEffect(() => {
    if (!selectedSpace) return;
    const t = setTimeout(() => {
      if (searchQRef.current !== searchInput) {
        searchQRef.current = searchInput;
        fetchPages(selectedSpace.id, searchInput);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, selectedSpace]);

  // 5. compileLog 自动滚动到底部
  useEffect(() => {
    if (compileLogRef.current) {
      compileLogRef.current.scrollTop = compileLogRef.current.scrollHeight;
    }
  }, [compileLog]);

  const fetchPages = async (spaceId: number, q: string) => {
    setLoadingPages(true);
    try {
      const url = `/api/wiki/pages?spaceId=${spaceId}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setPages(data.items || []);
    } catch (e) {
      console.error('fetchPages error:', e);
      setPages([]);
    } finally {
      setLoadingPages(false);
    }
  };

  const loadPage = async (pageId: number) => {
    setLoadingPage(true);
    try {
      const res = await fetch(`/api/wiki/pages/${pageId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '加载失败');
      }
      const data = await res.json();
      setSelectedPage(data);
      // 更新 URL
      const sid = selectedSpace?.id || data.spaceId;
      window.history.replaceState(null, '', `/wiki?spaceId=${sid}&pageId=${pageId}`);
    } catch (e: any) {
      console.error('loadPage error:', e);
      setSelectedPage(null);
    } finally {
      setLoadingPage(false);
    }
  };

  const loadPageDirect = async (pageId: number) => {
    setLoadingPage(true);
    try {
      const res = await fetch(`/api/wiki/pages/${pageId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedPage(data);
      }
    } catch (e) {
      console.error('loadPageDirect error:', e);
    } finally {
      setLoadingPage(false);
    }
  };

  const handleCompileConcept = async (slug: string) => {
    if (!selectedSpace) {
      alert('请先选择一个 space');
      return;
    }
    setCompilingSlug(slug);
    appendLog(`▶ 编译 ${slug} ...`);
    try {
      const res = await fetch('/api/wiki/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: 'worldquant', mode: 'glossary', concept: slug }),
      });
      const data = await res.json();
      if (!data.configured) {
        appendLog(`  ✗ AI 未配置`);
      } else if (data.ok) {
        if (data.alreadyExists) {
          appendLog(`  ✓ 已存在 (confidence=${data.confidence})，跳过`);
        } else {
          appendLog(`  ✓ 成功 pageId=${data.pageId} confidence=${data.confidence} sources=${data.sourceCount}`);
        }
        // 刷新 pages 列表
        if (selectedSpace) fetchPages(selectedSpace.id, searchQRef.current);
      } else {
        appendLog(`  ✗ 失败: ${data.reason || '未知错误'}`);
      }
    } catch (e: any) {
      appendLog(`  ✗ 请求失败: ${e.message}`);
    } finally {
      setCompilingSlug(null);
    }
  };

  const handleCompileAll = async () => {
    if (compileAllRunning) return;
    if (!selectedSpace) {
      alert('请先选择一个 space');
      return;
    }
    setCompileAllRunning(true);
    appendLog(`=== 开始批量编译 ${WQ_CONCEPTS_FOR_COMPILE.length} 个概念 ===`);
    for (const c of WQ_CONCEPTS_FOR_COMPILE) {
      await handleCompileConceptSilent(c.slug);
    }
    appendLog(`=== 批量编译完成 ===`);
    setCompileAllRunning(false);
  };

  const handleCompileConceptSilent = async (slug: string) => {
    setCompilingSlug(slug);
    appendLog(`▶ 编译 ${slug} ...`);
    try {
      const res = await fetch('/api/wiki/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: 'worldquant', mode: 'glossary', concept: slug }),
      });
      const data = await res.json();
      if (!data.configured) {
        appendLog(`  ✗ AI 未配置，中止批量编译`);
        setCompileAllRunning(false);
        return false;
      } else if (data.ok) {
        if (data.alreadyExists) {
          appendLog(`  ✓ 已存在 (confidence=${data.confidence})，跳过`);
        } else {
          appendLog(`  ✓ 成功 pageId=${data.pageId} confidence=${data.confidence} sources=${data.sourceCount}`);
        }
      } else {
        appendLog(`  ✗ 失败: ${data.reason || '未知错误'}`);
      }
    } catch (e: any) {
      appendLog(`  ✗ 请求失败: ${e.message}`);
    } finally {
      setCompilingSlug(null);
    }
    return true;
  };

  const appendLog = (msg: string) => {
    setCompileLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="📚 LLM-Wiki 知识层" />

      <div className="flex h-[calc(100vh-48px)]">
        {/* Left: Spaces */}
        <div className="w-64 border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">Wiki Spaces</h2>
            {loadingSpaces ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : spaces.length === 0 ? (
              <p className="text-sm text-slate-400">
                尚无 wiki space。
                <br />
                编译概念或项目后会自动创建 space。
              </p>
            ) : (
              (() => {
                const conceptSpaces = spaces.filter((s) => s.sourceType !== 'project');
                const projectSpaces = spaces.filter((s) => s.sourceType === 'project');
                const renderSpace = (s: WikiSpace) => (
                  <div
                    key={s.id}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      selectedSpace?.id === s.id
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                    onClick={() => setSelectedSpace(s)}
                  >
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{s.pageCount} 篇 wiki page</div>
                    {s.description && (
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">{s.description}</div>
                    )}
                  </div>
                );
                return (
                  <div className="space-y-4">
                    {conceptSpaces.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">📚 Concept Spaces</div>
                        <div className="space-y-2">{conceptSpaces.map(renderSpace)}</div>
                      </div>
                    )}
                    {projectSpaces.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">🗂 Project Spaces</div>
                        <div className="space-y-2">{projectSpaces.map(renderSpace)}</div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* Middle: Pages list + compile area */}
        <div className="w-80 border-r border-slate-200 bg-white overflow-y-auto flex flex-col">
          {/* Compile area */}
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-600">概念编译</h3>
              <button
                onClick={handleCompileAll}
                disabled={compileAllRunning || !selectedSpace}
                className={`text-xs px-2 py-1 rounded ${
                  compileAllRunning || !selectedSpace
                    ? 'bg-slate-200 text-slate-400'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {compileAllRunning ? '编译中...' : '编译全部缺失'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {WQ_CONCEPTS_FOR_COMPILE.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => handleCompileConcept(c.slug)}
                  disabled={compilingSlug !== null || !selectedSpace}
                  className={`text-xs px-2 py-1 rounded border transition ${
                    compilingSlug === c.slug
                      ? 'bg-yellow-100 border-yellow-300 text-yellow-700'
                      : compilingSlug !== null || !selectedSpace
                      ? 'bg-slate-100 border-slate-200 text-slate-400'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {compilingSlug === c.slug ? '⏳' : ''} {c.title}
                </button>
              ))}
            </div>
            {compileLog.length > 0 && (
              <div
                ref={compileLogRef}
                className="mt-2 max-h-32 overflow-y-auto bg-slate-900 text-slate-100 text-xs p-2 rounded font-mono"
              >
                {compileLog.map((line, i) => (
                  <div key={i} className="leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="p-3 border-b border-slate-200">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索 wiki page..."
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Pages list */}
          <div className="flex-1 overflow-y-auto p-3">
            {!selectedSpace ? (
              <p className="text-sm text-slate-400">请先选择一个 space</p>
            ) : loadingPages ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : pages.length === 0 ? (
              <p className="text-sm text-slate-400">
                尚无 wiki page。
                <br />
                点击上方概念按钮开始编译。
              </p>
            ) : (
              <div className="space-y-2">
                {pages.map((p) => {
                  const pt = parsePageType(p.tagsJson);
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        selectedPage?.id === p.id
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                      onClick={() => loadPage(p.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm flex-1 truncate">{p.title}</span>
                        {pt && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded border ${pageTypeBadgeClass(pt)}`}
                          >
                            {PAGE_TYPE_LABELS[pt] || pt}
                          </span>
                        )}
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border ${confidenceColor(p.confidence)}`}
                        >
                          {p.confidence}
                        </span>
                      </div>
                      {p.summary && (
                        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{p.summary}</div>
                      )}
                      <div className="text-xs text-slate-400 mt-1">{formatDate(p.updatedAt)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Page content */}
        <div className="flex-1 bg-white overflow-y-auto">
          {loadingPage ? (
            <div className="p-8 text-center text-slate-400">加载中...</div>
          ) : !selectedPage ? (
            <div className="p-8 text-center text-slate-400">
              <p className="text-lg mb-2">📖 LLM-Wiki</p>
              <p className="text-sm">
                选择左侧 wiki page 查看内容，或点击概念按钮编译生成。
              </p>
            </div>
          ) : (
            <div className="p-6 max-w-3xl">
              {/* Header */}
              <div className="mb-4 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-slate-800">{selectedPage.title}</h1>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${confidenceColor(selectedPage.confidence)}`}
                  >
                    {selectedPage.confidence}
                  </span>
                </div>
                {selectedPage.summary && (
                  <p className="text-sm text-slate-500">{selectedPage.summary}</p>
                )}
                {selectedPage.aliases && selectedPage.aliases.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedPage.aliases.map((a, i) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
                {selectedPage.tags && selectedPage.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedPage.tags.map((t, i) => (
                      <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Content */}
              <article className="prose prose-slate max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
                  {selectedPage.content || ''}
                </ReactMarkdown>
              </article>

              {/* Source refs */}
              {selectedPage.sourceRefs && selectedPage.sourceRefs.length > 0 && (
                <div className="mt-8 pt-4 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">来源文档 ({selectedPage.sourceRefs.length})</h3>
                  <div className="space-y-2">
                    {selectedPage.sourceRefs.map((s, i) => (
                      <div key={i} className="text-xs bg-slate-50 border border-slate-200 rounded p-2">
                        <div className="font-mono text-slate-600">
                          {s.relPath || `(docId=${s.docId})`}
                        </div>
                        {s.excerpt && (
                          <div className="text-slate-500 mt-1 line-clamp-3">{s.excerpt}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Links */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                {selectedPage.outgoingLinks && selectedPage.outgoingLinks.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">出链 ({selectedPage.outgoingLinks.length})</h3>
                    <div className="space-y-1">
                      {selectedPage.outgoingLinks.map((l) => (
                        <div key={l.id}>
                          {l.toPageId && !l.unresolved ? (
                            <button
                              onClick={() => loadPage(l.toPageId!)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              → {l.title || l.linkText}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              → {l.linkText} (未解析)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedPage.backlinks && selectedPage.backlinks.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">反向链接 ({selectedPage.backlinks.length})</h3>
                    <div className="space-y-1">
                      {selectedPage.backlinks.map((l) => (
                        <div key={l.id}>
                          {l.fromPageId ? (
                            <button
                              onClick={() => loadPage(l.fromPageId)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              ← {l.title || l.linkText}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              ← {l.linkText}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
