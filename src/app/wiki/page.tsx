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

/** 安全的 JSON 解析：response.body 为空或非 JSON 时返回 error response，不抛异常 */
async function safeJson(res: Response): Promise<{ configured: boolean; ok: boolean; [key: string]: unknown }> {
  const text = await res.text();
  if (!text.trim()) {
    return { configured: true, ok: false, reason: `HTTP ${res.status} — empty response body` };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { configured: true, ok: false, reason: `HTTP ${res.status} — invalid JSON: ${text.slice(0, 200)}` };
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

/**
 * 客户端镜像的 Project Brain profile（与服务端 REPO_PROFILES 保持一致）。
 * 用于决定 Project Brain 操作区显示哪些编译按钮。
 * 不改 API/DB，纯前端渲染控制。
 */
const CLIENT_REPO_PROFILES: Record<string, { profile: string; allowedModes: string[] }> = {
  'summary-for-work': { profile: 'docs', allowedModes: ['overview', 'commits'] },
  'worldquant': { profile: 'mixed', allowedModes: ['overview', 'modules', 'commits'] },
  'teach': { profile: 'code', allowedModes: ['overview', 'modules', 'configs', 'commits'] },
};
const DEFAULT_CLIENT_PROFILE = { profile: 'code', allowedModes: ['overview', 'modules', 'configs', 'commits'] };

function getClientProfile(repoName: string) {
  return CLIENT_REPO_PROFILES[repoName] || DEFAULT_CLIENT_PROFILE;
}

/** Project Brain 操作按钮统一样式：running 当前步骤=黄色，其它步骤禁用=灰色，空闲=白底 */
function brainBtnClass(running: string | null, current: string): string {
  if (running === current) return 'text-xs px-2 py-1 rounded border bg-yellow-100 border-yellow-300 text-yellow-700';
  if (running !== null) return 'text-xs px-2 py-1 rounded border bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed';
  return 'text-xs px-2 py-1 rounded border bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-600';
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

  // Project Brain 构建状态
  // brainRunning: null=空闲, 'scan'/'compile:overview'/.../'ontology'/'all'=当前正在执行的步骤
  const [brainRunning, setBrainRunning] = useState<string | null>(null);
  const [brainStatus, setBrainStatus] = useState<{
    codeFileCount?: number;
    symbolCount?: number;
    lastScanAt?: string | null;
    wikiPages?: Array<{ id: number; slug: string; title: string; pageType: string; confidence: string; updatedAt: string }>;
  } | null>(null);

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
    // 项目 space：拉取 Project Brain 状态
    if (selectedSpace.sourceType === 'project') {
      fetchBrainStatus(selectedSpace.name);
    } else {
      setBrainStatus(null);
    }
  }, [selectedSpace]);

  const fetchBrainStatus = async (repoName: string) => {
    try {
      const res = await fetch(`/api/project-brain/status?repoName=${encodeURIComponent(repoName)}`);
      if (!res.ok) {
        setBrainStatus(null);
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setBrainStatus({
          codeFileCount: data.codeFileCount,
          symbolCount: data.symbolCount,
          lastScanAt: data.lastScanAt,
          wikiPages: data.wikiPages,
        });
      } else {
        setBrainStatus(null);
      }
    } catch {
      setBrainStatus(null);
    }
  };

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

  // ─── Project Brain 操作（静默执行，不管理 brainRunning） ────────────────────

  const runScan = async (repoName: string): Promise<boolean> => {
    appendLog(`▶ 扫描代码文件 ...`);
    try {
      const res = await fetch('/api/project-brain/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName }),
      });
      const data = await safeJson(res);
      if (data.ok) {
        appendLog(
          `  ✓ scanned=${(data as any).scanned} inserted=${(data as any).inserted} updated=${(data as any).updated} skipped=${(data as any).skipped} skippedLargeFiles=${(data as any).skippedLargeFiles} removed=${(data as any).removed}`
        );
        return true;
      } else {
        appendLog(`  ✗ scan 失败: ${data.reason || '未知错误'}`);
        return false;
      }
    } catch (e: any) {
      appendLog(`  ✗ scan 请求失败: ${e.message}`);
      return false;
    }
  };

  const runCompileMode = async (repoName: string, mode: string): Promise<boolean> => {
    appendLog(`▶ 编译 ${mode} ...`);
    try {
      const res = await fetch('/api/project-brain/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName, mode }),
      });
      const data = await safeJson(res);
      if (!data.configured) {
        appendLog(`  ✗ AI 未配置，跳过 ${mode}`);
        return false;
      } else if (data.ok) {
        if (data.alreadyExists) {
          appendLog(`  ✓ ${mode} 已存在 (confidence=${data.confidence})，跳过`);
        } else {
          appendLog(`  ✓ ${mode} 成功 pageId=${data.pageId} confidence=${data.confidence} sources=${data.sourceCount}`);
        }
        return true;
      } else {
        appendLog(`  ✗ ${mode} 失败: ${data.error || data.reason || '未知错误'}`);
        return false;
      }
    } catch (e: any) {
      appendLog(`  ✗ ${mode} 请求失败: ${e.message}`);
      return false;
    }
  };

  const runOntology = async (repoName: string): Promise<boolean> => {
    appendLog(`▶ 构建 Ontology ...`);
    try {
      const res = await fetch('/api/project-brain/ontology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName }),
      });
      const data = await safeJson(res);
      if (data.ok) {
        appendLog(`  ✓ entities=${data.entityCount ?? 0} relations=${data.relationCount ?? 0}`);
        return true;
      } else {
        appendLog(`  ✗ ontology 失败: ${data.error || data.reason || '未知错误'}`);
        return false;
      }
    } catch (e: any) {
      appendLog(`  ✗ ontology 请求失败: ${e.message}`);
      return false;
    }
  };

  // ─── Project Brain 按钮处理器（管理 brainRunning + 刷新状态） ────────────────

  const refreshBrain = async (repoName: string, spaceId: number) => {
    await fetchBrainStatus(repoName);
    await fetchPages(spaceId, searchQRef.current);
  };

  const handleBrainScan = async () => {
    if (brainRunning) return;
    if (!selectedSpace || selectedSpace.sourceType !== 'project') return;
    const repoName = selectedSpace.name;
    setBrainRunning('scan');
    await runScan(repoName);
    setBrainRunning(null);
    await refreshBrain(repoName, selectedSpace.id);
  };

  const handleBrainCompileMode = async (mode: string) => {
    if (brainRunning) return;
    if (!selectedSpace || selectedSpace.sourceType !== 'project') return;
    const repoName = selectedSpace.name;
    setBrainRunning(`compile:${mode}`);
    await runCompileMode(repoName, mode);
    setBrainRunning(null);
    await refreshBrain(repoName, selectedSpace.id);
  };

  const handleBrainOntology = async () => {
    if (brainRunning) return;
    if (!selectedSpace || selectedSpace.sourceType !== 'project') return;
    const repoName = selectedSpace.name;
    setBrainRunning('ontology');
    await runOntology(repoName);
    setBrainRunning(null);
    await refreshBrain(repoName, selectedSpace.id);
  };

  /**
   * 一键构建 Project Brain（profile-aware）：
   *   1. scan（失败则停止所有后续步骤）
   *   2. compile 每个 profile.allowedModes（失败继续但标记）
   *   3. ontology
   * docs profile 只跑 overview + commits；code profile 跑全部 4 个模式。
   */
  const handleBrainBuildAll = async () => {
    if (brainRunning) return;
    if (!selectedSpace || selectedSpace.sourceType !== 'project') return;
    const repoName = selectedSpace.name;
    const profile = getClientProfile(repoName);
    setBrainRunning('all');
    appendLog(`=== 一键构建 Project Brain: ${repoName} (profile=${profile.profile}) ===`);
    const scanOk = await runScan(repoName);
    if (!scanOk) {
      appendLog(`=== scan 失败，停止后续步骤 ===`);
      setBrainRunning(null);
      return;
    }
    for (const mode of profile.allowedModes) {
      const ok = await runCompileMode(repoName, mode);
      // AI 未配置或编译失败：标记原因，继续尝试其他模式（不阻塞全流程）
      if (!ok) {
        appendLog(`  ⚠ ${mode} 未成功，后续步骤继续`);
      }
    }
    await runOntology(repoName);
    await refreshBrain(repoName, selectedSpace.id);
    appendLog(`=== Project Brain 构建完成 ===`);
    setBrainRunning(null);
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
            {selectedSpace?.sourceType === 'repo' ? (
              /* Concept Space: 概念编译按钮 */
              <div>
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
              </div>
            ) : selectedSpace?.sourceType === 'project' ? (
              /* Project Space: Project Brain 操作区（按钮按 profile.allowedModes 显示） */
              (() => {
                const profile = getClientProfile(selectedSpace.name);
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-slate-600">
                        Project Brain <span className="text-slate-400 font-normal">({profile.profile})</span>
                      </h3>
                    </div>
                    {/* 操作按钮 */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      <button onClick={handleBrainScan} disabled={brainRunning !== null} className={brainBtnClass(brainRunning, 'scan')}>
                        {brainRunning === 'scan' ? '⏳ ' : ''}扫描代码
                      </button>
                      {profile.allowedModes.includes('overview') && (
                        <button onClick={() => handleBrainCompileMode('overview')} disabled={brainRunning !== null} className={brainBtnClass(brainRunning, 'compile:overview')}>
                          {brainRunning === 'compile:overview' ? '⏳ ' : ''}编译 Overview
                        </button>
                      )}
                      {profile.allowedModes.includes('modules') && (
                        <button onClick={() => handleBrainCompileMode('modules')} disabled={brainRunning !== null} className={brainBtnClass(brainRunning, 'compile:modules')}>
                          {brainRunning === 'compile:modules' ? '⏳ ' : ''}编译 Modules
                        </button>
                      )}
                      {profile.allowedModes.includes('configs') && (
                        <button onClick={() => handleBrainCompileMode('configs')} disabled={brainRunning !== null} className={brainBtnClass(brainRunning, 'compile:configs')}>
                          {brainRunning === 'compile:configs' ? '⏳ ' : ''}编译 Configs
                        </button>
                      )}
                      {profile.allowedModes.includes('commits') && (
                        <button onClick={() => handleBrainCompileMode('commits')} disabled={brainRunning !== null} className={brainBtnClass(brainRunning, 'compile:commits')}>
                          {brainRunning === 'compile:commits' ? '⏳ ' : ''}编译 Commits
                        </button>
                      )}
                      <button onClick={handleBrainOntology} disabled={brainRunning !== null} className={brainBtnClass(brainRunning, 'ontology')}>
                        {brainRunning === 'ontology' ? '⏳ ' : ''}构建 Ontology
                      </button>
                      <button
                        onClick={handleBrainBuildAll}
                        disabled={brainRunning !== null}
                        className={`text-xs px-2 py-1 rounded ${
                          brainRunning === 'all'
                            ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                            : brainRunning !== null
                            ? 'bg-slate-200 text-slate-400'
                            : 'bg-emerald-500 text-white hover:bg-emerald-600'
                        }`}
                      >
                        {brainRunning === 'all' ? '构建中...' : '一键构建 Project Brain'}
                      </button>
                    </div>
                    {/* 状态摘要 */}
                    {brainStatus && (
                      <div className="text-xs text-slate-500 space-y-0.5">
                        <div>代码文件: {brainStatus.codeFileCount ?? 0}</div>
                        <div>符号: {brainStatus.symbolCount ?? 0}</div>
                        <div>Wiki 页: {brainStatus.wikiPages?.length ?? 0}</div>
                        <div>上次扫描: {brainStatus.lastScanAt ? formatDate(brainStatus.lastScanAt) : '-'}</div>
                      </div>
                    )}
                    {brainStatus && brainStatus.wikiPages && brainStatus.wikiPages.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {brainStatus.wikiPages.map((p) => (
                          <span
                            key={p.id}
                            className={`text-xs px-1.5 py-0.5 rounded border ${pageTypeBadgeClass(p.pageType)}`}
                            title={p.title}
                          >
                            {PAGE_TYPE_LABELS[p.pageType] || p.pageType}: {p.confidence}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-xs text-slate-400">请先选择一个 space</p>
            )}
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
