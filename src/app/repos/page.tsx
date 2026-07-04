'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import NavBar from '@/components/NavBar';

interface Repo {
  id: number;
  name: string;
  url: string;
  branch: string;
  localPath: string;
  enabled: boolean;
  lastSyncAt: string | null;
}

interface DocSummary {
  id: number;
  repoId: number;
  title: string;
  relPath: string;
  filePath: string;
  excerpt: string;
  updatedAt: string;
}

interface DocDetail extends DocSummary {
  content: string;
}

interface DocsResponse {
  items: DocSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface SyncResult {
  success: boolean;
  message: string;
  added?: number;
  updated?: number;
  removed?: number;
}

const INITIAL_REPOS = [
  { name: 'summary-for-work', url: 'https://github.com/JannLeo/summary-for-work.git', branch: 'main' },
  { name: 'worldquant', url: 'https://github.com/JannLeo/worldquant.git', branch: 'main' },
  { name: 'teach', url: 'https://github.com/JannLeo/teach.git', branch: 'main' },
];

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [syncResults, setSyncResults] = useState<Record<number, SyncResult>>({});
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [documents, setDocuments] = useState<DocSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocDetail | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Pagination state
  const [docsTotal, setDocsTotal] = useState(0);
  const [docsOffset, setDocsOffset] = useState(0);
  const [docsLimit] = useState(100);
  const [searchQ, setSearchQ] = useState('');
  const searchQRef = useRef('');

  // Init: fetch repos first
  useEffect(() => { fetchRepos(); }, []);

  // After repos load, check URL for deep link (repoId + optional docId)
  useEffect(() => {
    if (repos.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const repoIdParam = params.get('repoId');
    const docIdParam = params.get('docId');
    if (!repoIdParam) return;

    const repoId = parseInt(repoIdParam, 10);
    if (isNaN(repoId)) return;
    const repo = repos.find(r => r.id === repoId);
    if (!repo) return;

    setSelectedRepo(repo);
    setSearchQ('');
    searchQRef.current = '';
    setDocsOffset(0);

    if (docIdParam) {
      const docId = parseInt(docIdParam, 10);
      if (!isNaN(docId)) {
        // Deep link: directly load doc without waiting for list
        loadDocumentDirect(repoId, docId);
        loadDocs(repoId, 0, '');
      } else {
        loadDocs(repoId, 0, '');
      }
    } else {
      loadDocs(repoId, 0, '');
    }
  }, [repos]);

  const fetchRepos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/repos');
      if (res.ok) setRepos(await res.json());
    } catch {}
    setLoading(false);
  };

  const ensureRepos = async () => {
    for (const r of INITIAL_REPOS) {
      const exists = repos.find(repo => repo.name === r.name);
      if (!exists) {
        await fetch('/api/repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r),
        });
      }
    }
    await fetchRepos();
  };

  const handleSync = async (repo: Repo) => {
    setSyncing(repo.id);
    try {
      const res = await fetch(`/api/repos/${repo.id}/sync`, { method: 'POST' });
      const result: SyncResult = await res.json();
      setSyncResults(prev => ({ ...prev, [repo.id]: result }));
      if (selectedRepo?.id === repo.id) {
        setSearchQ('');
        searchQRef.current = '';
        setDocsOffset(0);
        loadDocs(repo.id, 0, '');
      }
    } catch (err: any) {
      setSyncResults(prev => ({ ...prev, [repo.id]: { success: false, message: String(err) } }));
    }
    setSyncing(null);
  };

  // Load paginated docs
  const loadDocs = useCallback(async (repoId: number, offset: number, q: string) => {
    setLoadingDocs(true);
    try {
      const params = new URLSearchParams({ limit: String(docsLimit), offset: String(offset) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/repos/${repoId}/documents?${params}`);
      if (res.ok) {
        const data: DocsResponse = await res.json();
        if (offset === 0) {
          setDocuments(data.items);
        } else {
          setDocuments(prev => [...prev, ...data.items]);
        }
        setDocsTotal(data.total);
        setDocsOffset(offset + data.items.length);
      }
    } catch {}
    setLoadingDocs(false);
  }, [docsLimit]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedRepo && searchQRef.current !== searchQ) {
        searchQRef.current = searchQ;
        setDocsOffset(0);
        loadDocs(selectedRepo.id, 0, searchQ);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQ, selectedRepo, loadDocs]);

  // Load more
  const handleLoadMore = () => {
    if (!selectedRepo) return;
    loadDocs(selectedRepo.id, docsOffset, searchQRef.current);
  };

  // Direct doc load (for deep links, bypasses list)
  const loadDocumentDirect = async (repoId: number, docId: number) => {
    setLoadingDoc(true);
    setDocError(null);
    setSelectedDoc(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/documents/${docId}`);
      if (res.ok) {
        const doc: DocDetail = await res.json();
        setSelectedDoc(doc);
      } else {
        setDocError('文档不存在或未同步');
      }
    } catch { setDocError('加载文档失败'); }
    setLoadingDoc(false);
  };

  // Load doc from list click
  const loadDocument = async (repoId: number, docId: number) => {
    setLoadingDoc(true);
    setDocError(null);
    setSelectedDoc(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/documents/${docId}`);
      if (res.ok) {
        setSelectedDoc(await res.json());
      } else {
        setDocError('文档不存在或未同步');
      }
    } catch { setDocError('加载文档失败'); }
    setLoadingDoc(false);
  };

  // Select repo (resets search, doc)
  const handleRepoSelect = (repo: Repo) => {
    setSelectedRepo(repo);
    setSelectedDoc(null);
    setDocError(null);
    setDocuments([]);
    setSearchQ('');
    searchQRef.current = '';
    setDocsOffset(0);
    setDocsTotal(0);
    window.history.replaceState(null, '', `/repos?repoId=${repo.id}`);
    loadDocs(repo.id, 0, '');
  };

  // Select doc from list
  const handleDocSelect = (doc: DocSummary) => {
    if (!selectedRepo) return;
    loadDocument(selectedRepo.id, doc.id);
    window.history.replaceState(null, '', `/repos?repoId=${selectedRepo.id}&docId=${doc.id}`);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '从未同步';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const showing = documents.length;
  const hasMore = showing < docsTotal;

  return (
    <div className="page-shell">
      <NavBar title="📚 GitHub 知识库" />

      <div className="bg-white px-6 py-2 border-b border-slate-100">
        <button onClick={ensureRepos} className="text-sm text-slate-500 hover:text-slate-800">
          同步配置
        </button>
      </div>

      <div className="flex h-[calc(100vh-57px)]">
        {/* Left: Repo list */}
        <div className="w-80 border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-2">
            {loading ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : repos.length === 0 ? (
              <div>
                <p className="text-sm text-slate-400 mb-3">尚未配置仓库</p>
                <button onClick={ensureRepos} className="w-full app-button-primary rounded-lg py-2 text-sm ">
                  添加三个知识库仓库
                </button>
              </div>
            ) : (
              repos.map(repo => (
                <div
                  key={repo.id}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    selectedRepo?.id === repo.id
                      ? 'border-teal-500/50 bg-teal-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                  onClick={() => handleRepoSelect(repo)}
                >
                  <div className="font-medium text-sm">{repo.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">上次同步: {formatDate(repo.lastSyncAt)}</div>
                  <button
                    onClick={e => { e.stopPropagation(); handleSync(repo); }}
                    disabled={syncing === repo.id}
                    className={`mt-2 text-xs px-3 py-1 rounded-full transition ${
                      syncing === repo.id
                        ? 'bg-slate-100 text-slate-400'
                        : 'app-button-primary '
                    }`}
                  >
                    {syncing === repo.id ? '同步中...' : '🔄 同步'}
                  </button>
                  {syncResults[repo.id] && syncing === null && (
                    <div className={`mt-2 text-xs p-2 rounded ${
                      syncResults[repo.id].success
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {syncResults[repo.id].success
                        ? `成功 (+${syncResults[repo.id].added ?? 0} -${syncResults[repo.id].removed ?? 0})`
                        : `同步失败: ${syncResults[repo.id].message}`}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Middle: Document list */}
        <div className="w-80 border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-bold text-slate-700 mb-3">
              {selectedRepo ? `${selectedRepo.name} 的文档` : '文档列表'}
            </h2>

            {/* Search box */}
            {selectedRepo && (
              <div className="mb-3">
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="搜索标题或路径..."
                  className="w-full px-3 py-1.5 app-input rounded-lg text-xs focus:outline-none "
                />
                {docsTotal > 0 && (
                  <div className="text-xs text-slate-400 mt-1">
                    显示 {showing} / {docsTotal}
                  </div>
                )}
              </div>
            )}

            {loadingDocs ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : !selectedRepo ? (
              <p className="text-sm text-slate-400">请选择一个仓库</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-slate-400">暂无文档，先点击同步拉取仓库</p>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    className={`p-2 rounded border cursor-pointer text-sm transition ${
                      selectedDoc?.id === doc.id
                        ? 'border-teal-500/50 bg-teal-50 ring-1 ring-blue-300'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => handleDocSelect(doc)}
                  >
                    <div className="font-medium truncate">{doc.title || '无标题'}</div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{doc.relPath}</div>
                  </div>
                ))}

                {/* Load more */}
                {hasMore && (
                  <button
                    onClick={handleLoadMore}
                    className="w-full py-2 text-xs text-teal-700 hover:text-blue-800 border border-teal-200 rounded-lg hover:bg-teal-50 transition"
                  >
                    加载更多 ({showing} / {docsTotal})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Document content */}
        <div className="flex-1 bg-white overflow-y-auto">
          <div className="p-6">
            {docError ? (
              <div className="text-sm text-red-500 text-center mt-20">
                <p className="text-4xl mb-2">⚠️</p>
                <p>{docError}</p>
              </div>
            ) : loadingDoc ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : !selectedDoc ? (
              <div className="text-sm text-slate-400 text-center mt-20">
                <p className="text-4xl mb-2">📄</p>
                <p>选择一个文档查看内容</p>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold mb-1">{selectedDoc.title || '无标题'}</h2>
                <p className="text-xs text-slate-400 mb-4">{selectedDoc.relPath}</p>
                <div className="prose prose-sm max-w-none">
                  {selectedDoc.content.split('\n').map((line: string, i: number) => (
                    <p key={i} className="text-sm leading-relaxed">{line || '\u00A0'}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}