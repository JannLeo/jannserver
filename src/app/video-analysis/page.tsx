'use client';
import { useState, useEffect, useCallback } from 'react';
import NavBar from '@/components/NavBar';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface JobMessage { t: string; level: string; msg: string; }

interface Job {
  id: number;
  platform: string;
  crawlType: string;
  keyword: string;
  targetUrl: string;
  targetId: string;
  status: string;
  progress: number;
  message: JobMessage[];
  resultCount: number;
  error: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

interface StatusInfo {
  configured: boolean;
  serviceReachable: boolean;
  baseUrl: string | null;
  error: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  bilibili: 'B站',
  douyin: '抖音',
  kuaishou: '快手',
  xhs: '小红书',
};

const PLATFORM_COLORS: Record<string, string> = {
  bilibili: 'bg-pink-100 text-pink-700',
  douyin: 'bg-slate-100 text-slate-700',
  kuaishou: 'bg-orange-100 text-orange-700',
  xhs: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  stopped: 'bg-amber-100 text-amber-700',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待运行',
  running: '采集中',
  success: '已完成',
  failed: '失败',
  stopped: '已停止',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[platform] || 'bg-slate-100 text-slate-600'}`}>
      {PLATFORM_LABELS[platform] || platform}
    </span>
  );
}

function formatTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function LogList({ messages }: { messages: JobMessage[] }) {
  if (!messages || messages.length === 0) return <p className="text-xs text-slate-400">暂无日志</p>;
  const colorMap: Record<string, string> = {
    info: 'text-slate-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    success: 'text-green-400',
    debug: 'text-slate-500',
  };
  return (
    <div className="space-y-0.5 max-h-40 overflow-y-auto bg-slate-900 rounded p-2 font-mono text-xs">
      {messages.slice(-30).map((m, i) => (
        <div key={i} className={`${colorMap[m.level] || 'text-slate-400'}`}>
          <span className="text-slate-600 mr-2">{m.t && m.t.length > 10 ? m.t.slice(11, 19) : '--:--:--'}</span>
          {m.msg}
        </div>
      ))}
    </div>
  );
}

export default function VideoAnalysisPage() {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  const [platform, setPlatform] = useState('bilibili');
  const [crawlType, setCrawlType] = useState('search');
  const [keyword, setKeyword] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [limit, setLimit] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [tab, setTab] = useState<'list' | 'create'>('list');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/video-analysis/status');
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  const fetchJobs = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/video-analysis/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStatus(), fetchJobs()]).finally(() => setLoading(false));
  }, [fetchStatus, fetchJobs]);

  const handleCreate = async () => {
    if (crawlType === 'search' && !keyword.trim()) {
      setSubmitError('请输入关键词');
      return;
    }
    if (crawlType === 'detail' && !targetUrl.trim()) {
      setSubmitError('请输入目标链接');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/video-analysis/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, crawlType, keyword: keyword.trim(), targetUrl: targetUrl.trim(), limit }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmitError(data.error || '创建失败');
        return;
      }
      setTab('list');
      setKeyword('');
      setTargetUrl('');
      fetchJobs();
    } catch (err: any) {
      setSubmitError(err.message);
    }
    setSubmitting(false);
  };

  const handleRun = async (jobId: number) => {
    try {
      const res = await fetch(`/api/video-analysis/jobs/${jobId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || '运行失败');
        return;
      }
      fetchJobs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleView = async (job: Job) => {
    setSelectedJob(job);
    setDetailData(null);
    setAnalyzeResult(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/video-analysis/jobs/${job.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
        if (data.report?.markdown) setAnalyzeResult(data.report.markdown);
      }
    } catch {}
    setDetailLoading(false);
  };

  const handleAnalyze = async (jobId: number) => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const res = await fetch(`/api/video-analysis/jobs/${jobId}/analyze`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || '分析失败');
        return;
      }
      setAnalyzeResult(data.markdown || '');
      const detailRes = await fetch(`/api/video-analysis/jobs/${jobId}`);
      if (detailRes.ok) setDetailData(await detailRes.json());
    } catch (err: any) {
      alert(err.message);
    }
    setAnalyzing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="🎬 视频分析工作台" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Status bar */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            {status && status.configured ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status.serviceReachable ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
                  <span className="text-sm font-medium text-slate-700">
                    {status.serviceReachable ? 'MediaCrawler 已连接' : 'MediaCrawler 未启动'}
                  </span>
                </div>
                {status.baseUrl && (
                  <span className="text-xs text-slate-400">{status.baseUrl}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-sm text-amber-700">
                  MediaCrawler 未配置 — 设置 MEDIA_CRAWLER_BASE_URL 和 MEDIA_CRAWLER_ENABLED=true 后可用
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => { fetchStatus(); fetchJobs(); }}
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50"
          >
            🔄 刷新
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 mb-4 w-fit">
          <button
            onClick={() => setTab('list')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'list' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            任务列表
          </button>
          <button
            onClick={() => setTab('create')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'create' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            + 新建任务
          </button>
        </div>

        {/* Create form */}
        {tab === 'create' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-4">
            <h2 className="text-base font-semibold text-slate-700 mb-4">创建采集任务</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">平台</label>
                <select
                  value={platform}
                  onChange={e => setPlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">采集类型</label>
                <select
                  value={crawlType}
                  onChange={e => setCrawlType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="search">关键词搜索</option>
                  <option value="detail">指定链接</option>
                  <option value="creator">指定作者</option>
                </select>
              </div>
              {crawlType === 'search' && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">关键词</label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    placeholder="例如：FPGA 测试"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}
              {crawlType === 'detail' && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">目标链接</label>
                  <input
                    type="text"
                    value={targetUrl}
                    onChange={e => setTargetUrl(e.target.value)}
                    placeholder="https://www.bilibili.com/video/..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">采集数量（上限 20）</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={limit}
                  onChange={e => setLimit(Math.min(Math.max(parseInt(e.target.value) || 5, 1), 20))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            {submitError && (
              <p className="mt-3 text-sm text-red-600">{submitError}</p>
            )}
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? '创建中...' : '创建任务'}
            </button>
          </div>
        )}

        {/* Job list */}
        {tab === 'list' && (
          <div>
            {jobs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
                暂无采集任务，切换到「新建任务」创建一个吧
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">平台</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">类型</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">关键词/URL</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">状态</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">结果</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">创建时间</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(job => (
                      <tr key={job.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5"><PlatformBadge platform={job.platform} /></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {job.crawlType === 'search' ? '搜索' : job.crawlType === 'detail' ? '链接' : '作者'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[200px] truncate" title={job.keyword || job.targetUrl}>
                          {job.keyword || job.targetUrl || '-'}
                        </td>
                        <td className="px-4 py-2.5"><StatusBadge status={job.status} /></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{job.resultCount} 条</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{formatTime(job.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 flex-wrap">
                            {job.status === 'pending' && (
                              <button
                                onClick={() => handleRun(job.id)}
                                className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                              >
                                运行
                              </button>
                            )}
                            {job.status === 'running' && (
                              <span className="text-xs px-2 py-1 bg-blue-50 text-blue-400 rounded">采集中</span>
                            )}
                            <button
                              onClick={() => handleView(job)}
                              className="text-xs px-2 py-1 bg-slate-50 text-slate-600 rounded hover:bg-slate-100"
                            >
                              查看
                            </button>
                            {job.status === 'success' && job.resultCount > 0 && (
                              <button
                                onClick={() => handleAnalyze(job.id)}
                                disabled={analyzing}
                                className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 disabled:opacity-50"
                              >
                                {analyzing ? '分析中...' : 'AI 分析'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-base font-semibold text-slate-800">任务详情 #{selectedJob.id}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {PLATFORM_LABELS[selectedJob.platform] || selectedJob.platform} · {formatTime(selectedJob.createdAt)}
                </p>
              </div>
              <button onClick={() => setSelectedJob(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading ? (
                <div className="text-center py-8 text-slate-400">加载中...</div>
              ) : detailData ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-slate-400 mb-1">状态</div>
                      <StatusBadge status={detailData.job.status} />
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-slate-400 mb-1">采集结果</div>
                      <div className="text-slate-700 font-medium">{detailData.job.resultCount} 条</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-slate-400 mb-1">关键词</div>
                      <div className="text-slate-700 truncate">{detailData.job.keyword || detailData.job.targetUrl || '-'}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-slate-400 mb-1">完成时间</div>
                      <div className="text-slate-700">{detailData.job.finishedAt ? formatTime(detailData.job.finishedAt) : '-'}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">任务日志</h4>
                    <LogList messages={detailData.job.message || []} />
                  </div>

                  {detailData.items && detailData.items.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">
                        采集结果 ({detailData.items.length} 条)
                      </h4>
                      <div className="space-y-2">
                        {detailData.items.slice(0, 10).map((item: any) => (
                          <div key={item.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">{item.title || '无标题'}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{item.authorName} · {item.publishTime || '-'}</div>
                                {item.content && (
                                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{String(item.content).slice(0, 150)}</div>
                                )}
                              </div>
                              {item.url && (
                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs flex-shrink-0">↗</a>
                              )}
                            </div>
                          </div>
                        ))}
                        {detailData.items.length > 10 && (
                          <p className="text-xs text-slate-400 text-center">还有 {detailData.items.length - 10} 条未显示</p>
                        )}
                      </div>
                    </div>
                  )}

                  {analyzeResult && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">AI 分析报告</h4>
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{analyzeResult}</pre>
                      </div>
                      <div className="mt-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(analyzeResult); alert('已复制'); }}
                          className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50"
                        >
                          复制 Markdown
                        </button>
                      </div>
                    </div>
                  )}

                  {!analyzeResult && detailData.report?.markdown && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">AI 分析报告（已保存）</h4>
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{detailData.report.markdown}</pre>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    {detailData.job.status === 'success' && detailData.job.resultCount > 0 && !analyzeResult && (
                      <button
                        onClick={() => handleAnalyze(detailData.job.id)}
                        disabled={analyzing}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {analyzing ? '分析中（120s超时）...' : '生成 AI 分析报告'}
                      </button>
                    )}
                    {analyzeResult && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(analyzeResult); alert('已复制'); }}
                        className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                      >
                        复制报告
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-center text-slate-400 py-4">无法加载详情</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}