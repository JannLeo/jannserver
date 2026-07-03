'use client';
import { useState, useEffect } from 'react';

interface Repo {
  id: number;
  name: string;
  url: string;
  branch: string;
  localPath: string;
  enabled: boolean;
  lastSyncAt: string | null;
}

interface RepoDocument {
  id: number;
  repoId: number;
  filePath: string;
  title: string;
  excerpt: string;
  contentHash: string;
  relPath: string;
  updatedAt: string;
}

interface DocDetail extends RepoDocument {
  content: string;
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
  const [documents, setDocuments] = useState<RepoDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocDetail | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Fetch repos on mount
  useEffect(() => { fetchRepos(); }, []);

  // After repos load, read URL params and initialize selection
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

    // Select repo, load docs, optionally load doc
    setSelectedRepo(repo);
    loadDocuments(repo.id, docIdParam ? parseInt(docIdParam, 10) : null);
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
      if (selectedRepo?.id === repo.id) loadDocuments(repo.id, null);
    } catch (err: any) {
      setSyncResults(prev => ({ ...prev, [repo.id]: { success: false, message: String(err) } }));
    }
    setSyncing(null);
  };

  const loadDocuments = async (repoId: number, docIdToSelect: number | null = null) => {
    setLoadingDocs(true);
    setSelectedDoc(null);
    setDocError(null);
    try {
      const repo = repos.find(r => r.id === repoId);
      if (repo) setSelectedRepo(repo);
      const res = await fetch(`/api/repos/${repoId}/documents`);
      if (res.ok) {
        const docs = await res.json();
        setDocuments(docs);
        // If docId was in URL, auto-select it
        if (docIdToSelect) {
          const found = docs.find((d: RepoDocument) => d.id === docIdToSelect);
          if (found) {
            await loadDocument(repoId, found.id);
          } else {
            setDocError('文档不存在或未同步');
          }
        }
      }
    } catch {}
    setLoadingDocs(false);
  };

  const loadDocument = async (repoId: number, docId: number) => {
    setLoadingDoc(true);
    setDocError(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/documents/${docId}`);
      if (res.ok) {
        setSelectedDoc(await res.json());
      } else {
        setSelectedDoc(null);
        setDocError('文档不存在或未同步');
      }
    } catch { setDocError('加载文档失败'); }
    setLoadingDoc(false);
  };

  // Update URL when repo/doc selection changes
  const handleRepoSelect = (repo: Repo) => {
    setSelectedRepo(repo);
    setSelectedDoc(null);
    setDocError(null);
    setDocuments([]);
    window.history.replaceState(null, '', `/repos?repoId=${repo.id}`);
    loadDocuments(repo.id, null);
  };

  const handleDocSelect = (doc: RepoDocument) => {
    if (!selectedRepo) return;
    loadDocument(selectedRepo.id, doc.id);
    window.history.replaceState(null, '', `/repos?repoId=${selectedRepo.id}&docId=${doc.id}`);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '从未同步';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">📚 GitHub 知识库</h1>
        <button onClick={ensureRepos} className="text-sm text-slate-500 hover:text-slate-800">
          同步配置
        </button>
      </header>

      <div className="flex h-[calc(100vh-57px)]">
        {/* Left: Repo list */}
        <div className="w-80 border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-2">
            {loading ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : repos.length === 0 ? (
              <div>
                <p className="text-sm text-slate-400 mb-3">尚未配置仓库</p>
                <button
                  onClick={ensureRepos}
                  className="w-full bg-blue-500 text-white rounded-lg py-2 text-sm hover:bg-blue-600"
                >
                  添加三个知识库仓库
                </button>
              </div>
            ) : (
              repos.map(repo => (
                <div
                  key={repo.id}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    selectedRepo?.id === repo.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                  onClick={() => handleRepoSelect(repo)}
                >
                  <div className="font-medium text-sm">{repo.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    上次同步: {formatDate(repo.lastSyncAt)}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleSync(repo); }}
                    disabled={syncing === repo.id}
                    className={`mt-2 text-xs px-3 py-1 rounded-full transition ${
                      syncing === repo.id
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
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
            {loadingDocs ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : !selectedRepo ? (
              <p className="text-sm text-slate-400">请选择一个仓库</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-slate-400">暂无文档，先点击同步拉取仓库</p>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 100).map(doc => (
                  <div
                    key={doc.id}
                    className={`p-2 rounded border cursor-pointer text-sm transition ${
                      selectedDoc?.id === doc.id
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => handleDocSelect(doc)}
                  >
                    <div className="font-medium truncate">{doc.title || '无标题'}</div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{doc.relPath}</div>
                  </div>
                ))}
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