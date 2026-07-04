'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import NavBar from '@/components/NavBar';

interface Repo {
  id: number;
  name: string;
  url: string;
  localPath: string;
  lastSyncAt: string | null;
  enabled: boolean;
}

interface CodeFile {
  id: number;
  relPath: string;
  language: string;
  sizeBytes: number;
  summary: string;
  indexedAt: string;
}

interface FileSymbol {
  symbolType: string;
  name: string;
  signature: string;
  startLine: number;
  endLine: number;
}

interface FileDetail {
  ok: boolean;
  repoId: number;
  repoName: string;
  fileId: number;
  relPath: string;
  language: string;
  content: string;
  symbols: FileSymbol[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function languageColor(lang: string): string {
  if (lang === 'c') return 'bg-teal-50 text-teal-700';
  if (lang === 'python') return 'bg-emerald-50 text-emerald-700';
  if (lang === 'ts') return 'bg-stone-100 text-stone-700';
  if (lang === 'json') return 'bg-amber-50 text-amber-700';
  if (lang === 'yaml') return 'bg-rose-50 text-rose-700';
  return 'bg-gray-100 text-gray-700';
}

// 把文件路径按目录前缀分组（最多 2 级深度）
function groupFilesByDir(files: CodeFile[]): { dir: string; files: CodeFile[] }[] {
  const groups = new Map<string, CodeFile[]>();
  for (const f of files) {
    const parts = f.relPath.split('/');
    let dir: string;
    if (parts.length <= 1) {
      dir = '(root)';
    } else if (parts.length === 2) {
      dir = parts[0];
    } else {
      // 取前两级 + .../last
      dir = `${parts[0]}/${parts[1]}`;
      if (parts.length > 3) dir += '/…';
    }
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(f);
  }
  return Array.from(groups.entries())
    .map(([dir, fs]) => ({ dir, files: fs.sort((a, b) => a.relPath.localeCompare(b.relPath)) }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

export default function CodePage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [fileDetail, setFileDetail] = useState<FileDetail | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  const searchInputRef = useRef('');
  const lineHighlightRef = useRef<HTMLDivElement | null>(null);

  // 1. 加载 repos
  const fetchRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch('/api/repos');
      const data = await res.json();
      const list: Repo[] = (data.repos || data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        localPath: r.localPath,
        lastSyncAt: r.lastSyncAt,
        enabled: r.enabled,
      }));
      setRepos(list);
    } catch (e) {
      console.error('fetchRepos error:', e);
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  // 2. 深链：读 URL ?repoId=&fileId=&line=
  useEffect(() => {
    if (repos.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const rid = params.get('repoId');
    const fid = params.get('fileId');
    if (rid) {
      const r = repos.find((x) => String(x.id) === rid);
      if (r) {
        setSelectedRepo(r);
        if (fid) {
          loadFileDetail(Number(fid), r.id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  // 3. selectedRepo 变 → fetch files
  useEffect(() => {
    if (!selectedRepo) return;
    fetchFiles(selectedRepo.id, '');
    setSearchInput('');
    searchInputRef.current = '';
    setSelectedFileId(null);
    setFileDetail(null);
  }, [selectedRepo]);

  // 4. 搜索防抖
  useEffect(() => {
    if (!selectedRepo) return;
    const t = setTimeout(() => {
      if (searchInputRef.current !== searchInput) {
        searchInputRef.current = searchInput;
        fetchFiles(selectedRepo.id, searchInput);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, selectedRepo]);

  const fetchFiles = async (repoId: number, q: string) => {
    setLoadingFiles(true);
    try {
      const url = `/api/code-files?repoId=${repoId}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error('fetchFiles error:', e);
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const loadFileDetail = async (fileId: number, repoId = selectedRepo?.id) => {
    if (!repoId) return;
    setLoadingFile(true);
    try {
      const res = await fetch(`/api/code-files?repoId=${repoId}&fileId=${fileId}`);
      if (!res.ok) {
        setFileDetail(null);
        return;
      }
      const data = await res.json();
      setFileDetail(data);
      setSelectedFileId(fileId);
      window.history.replaceState(
        null,
        '',
        `/code?repoId=${repoId}&fileId=${fileId}`
      );
      // 滚动到 ?line= 指定行
      const params = new URLSearchParams(window.location.search);
      const line = params.get('line');
      if (line) {
        setTimeout(() => {
          const el = document.getElementById(`line-${line}`);
          if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 100);
      }
    } catch (e) {
      console.error('loadFileDetail error:', e);
      setFileDetail(null);
    } finally {
      setLoadingFile(false);
    }
  };

  const groupedFiles = useMemo(() => groupFilesByDir(files), [files]);

  const lines = fileDetail?.content.split('\n') || [];

  return (
    <div className="page-shell">
      <NavBar title="📦 项目代码" />

      <div className="flex h-[calc(100vh-48px)]">
        {/* Left: Repo select + file list */}
        <div className="w-80 border-r border-stone-200/70 bg-white/45 overflow-y-auto flex flex-col">
          {/* Repo selector */}
          <div className="p-3 border-b border-slate-200">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Repo</label>
            <select
              value={selectedRepo?.id || ''}
              onChange={(e) => {
                const r = repos.find((x) => x.id === Number(e.target.value));
                if (r) setSelectedRepo(r);
              }}
              className="w-full px-2 py-1.5 text-sm app-input rounded-lg focus:outline-none "
            >
              <option value="">— 选择 repo —</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-slate-200">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索文件路径或摘要..."
              className="w-full px-3 py-1.5 text-sm app-input rounded-lg focus:outline-none "
            />
          </div>

          {/* Files list (grouped by dir prefix) */}
          <div className="flex-1 overflow-y-auto p-3">
            {!selectedRepo ? (
              <p className="text-sm text-slate-400">请先选择 repo</p>
            ) : loadingFiles ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : files.length === 0 ? (
              <p className="text-sm text-slate-400">
                尚无代码文件。
                <br />
                请先到 <a href="/wiki" className="text-teal-700 underline">/wiki</a> 触发 Project Brain 扫描。
              </p>
            ) : (
              <div className="space-y-3">
                {groupedFiles.map((g) => (
                  <div key={g.dir}>
                    <div className="text-xs font-mono text-slate-500 mb-1 px-1">{g.dir}/</div>
                    <div className="space-y-1">
                      {g.files.map((f) => (
                        <div
                          key={f.id}
                          className={`p-2 rounded-lg border cursor-pointer transition ${
                            selectedFileId === f.id
                              ? 'border-teal-500/50 bg-teal-50'
                              : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                          }`}
                          onClick={() => loadFileDetail(f.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] px-1 py-0.5 rounded font-mono ${languageColor(f.language)}`}
                            >
                              {f.language}
                            </span>
                            <span className="text-xs font-mono text-slate-700 flex-1 truncate">
                              {f.relPath.split('/').pop()}
                            </span>
                            <span className="text-[10px] text-slate-400">{formatBytes(f.sizeBytes)}</span>
                          </div>
                          {f.summary && (
                            <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 font-mono">
                              {f.summary}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: File content */}
        <div className="flex-1 bg-slate-900 overflow-hidden flex flex-col">
          {!fileDetail ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              {loadingFile ? (
                <span>加载中...</span>
              ) : (
                <div className="text-center">
                  <p className="text-lg mb-2">📦 项目代码</p>
                  <p className="text-sm">选择左侧文件查看内容（需先 Project Brain 扫描入库）</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* File header */}
              <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded font-mono ${languageColor(fileDetail.language)}`}
                >
                  {fileDetail.language}
                </span>
                <span className="text-sm font-mono text-slate-200 flex-1 truncate">
                  {fileDetail.relPath}
                </span>
                <span className="text-xs text-slate-400">{lines.length} lines</span>
              </div>

              {/* Symbol list */}
              {fileDetail.symbols.length > 0 && (
                <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {fileDetail.symbols.slice(0, 50).map((s, i) => (
                    <a
                      key={i}
                      href={`#line-${s.startLine}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(`line-${s.startLine}`);
                        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      }}
                      className="text-[11px] px-2 py-0.5 rounded bg-slate-700 text-slate-200 hover:bg-slate-600 font-mono"
                      title={s.signature}
                    >
                      <span className="text-slate-400">{s.symbolType}</span>{' '}
                      <span className="text-teal-200">{s.name}</span>
                      <span className="text-slate-500"> L{s.startLine}</span>
                    </a>
                  ))}
                </div>
              )}

              {/* Code with line numbers */}
              <div className="flex-1 overflow-auto">
                <pre className="text-xs font-mono leading-relaxed">
                  {lines.map((line, i) => {
                    const lineNo = i + 1;
                    const highlighted =
                      fileDetail.symbols.some(
                        (s) => lineNo >= s.startLine && lineNo <= s.endLine
                      );
                    return (
                      <div
                        key={i}
                        id={`line-${lineNo}`}
                        className={`flex ${
                          highlighted ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <span className="text-slate-600 select-none w-12 flex-shrink-0 text-right pr-3">
                          {lineNo}
                        </span>
                        <span className="text-slate-100 whitespace-pre flex-1 pr-4">
                          {line || ' '}
                        </span>
                      </div>
                    );
                  })}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
