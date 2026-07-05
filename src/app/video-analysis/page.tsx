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
  /** 根路径 `/` 是否可达。 */
  rootOk: boolean;
  /** /api/env/check 是否通过（null=未检测）。仅作 debugInfo。 */
  envCheckOk: boolean | null;
  /** /api/env/check 失败原因。 */
  envCheckError: string | null;
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

  const [tab, setTab] = useState<'list' | 'create' | 'agent-reach'>('list');

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
      <div className="page-shell flex items-center justify-center">
        <p className="text-slate-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="page-shell">
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
                {/* env/check 失败但根路径可达：提示 uv 依赖检查问题 */}
                {status.serviceReachable && status.envCheckOk === false && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    MediaCrawler API 已连接；环境检测接口失败，可能是 uv 依赖检查问题。
                  </span>
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
            className="text-sm px-3 py-1.5 app-button-secondary rounded-lg text-slate-600"
          >
            🔄 刷新
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 app-input rounded-lg p-1 mb-4 w-fit">
          <button
            onClick={() => setTab('list')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'list' ? 'app-button-primary' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            任务列表
          </button>
          <button
            onClick={() => setTab('create')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'create' ? 'app-button-primary' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            + 新建任务
          </button>
          <button
            onClick={() => setTab('agent-reach')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'agent-reach' ? 'app-button-primary' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            👁️ Agent Reach
          </button>
        </div>

        {/* Create form */}
        {tab === 'create' && (
          <div className="app-card p-6 mb-4">
            <h2 className="text-base font-semibold text-slate-700 mb-4">创建采集任务</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">平台</label>
                <select
                  value={platform}
                  onChange={e => setPlatform(e.target.value)}
                  className="w-full px-3 py-2 app-input rounded-lg text-sm focus:outline-none"
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
                  className="w-full px-3 py-2 app-input rounded-lg text-sm focus:outline-none"
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
                    className="w-full px-3 py-2 app-input rounded-lg text-sm focus:outline-none"
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
                    className="w-full px-3 py-2 app-input rounded-lg text-sm focus:outline-none"
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
                  className="w-full px-3 py-2 app-input rounded-lg text-sm focus:outline-none"
                />
              </div>
            </div>
            {submitError && (
              <p className="mt-3 text-sm text-red-600">{submitError}</p>
            )}
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="mt-4 px-5 py-2 app-button-primary rounded-lg text-sm font-medium  disabled:opacity-50"
            >
              {submitting ? '创建中...' : '创建任务'}
            </button>
          </div>
        )}

        {/* Agent Reach Tab */}
        {tab === 'agent-reach' && (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="app-panel p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-700 to-[#173f3c] flex items-center justify-center text-white text-xl flex-shrink-0 shadow-sm">
                  👁️
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-slate-800">Agent Reach</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    给你的 AI Agent 一键装上互联网能力 — YouTube、B站、Twitter、GitHub 等 13+ 平台
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <a
                      href="https://github.com/Panniantong/Agent-Reach"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-700 hover:underline"
                    >
                      github.com/Panniantong/Agent-Reach ↗
                    </a>
                    <span className="text-xs bg-blue-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">v1.5.0</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Install Command */}
            <div className="app-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-700 text-sm">⚡ 快速安装</h3>
                <p className="text-xs text-slate-400 mt-0.5">复制这条命令给你的 AI Agent（Claude Code / OpenClaw / Cursor 等）</p>
              </div>
              <div className="p-5">
                <div className="bg-slate-900 rounded-lg px-4 py-3 font-mono text-xs text-green-400 overflow-x-auto">
                  帮我安装 Agent Reach：https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <a
                    href="https://github.com/Panniantong/Agent-Reach"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 app-button-secondary rounded-lg text-slate-600"
                  >
                    📄 查看 README
                  </a>
                  <a
                    href="https://trendshift.io/repositories/24387"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 app-button-secondary rounded-lg text-slate-600"
                  >
                    📈 GitHub Trending #1
                  </a>
                </div>
              </div>
            </div>

            {/* Supported Platforms */}
            <div className="app-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-700 text-sm">🌐 支持的平台</h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {[
                    { icon: '🌐', name: '网页', desc: 'Jina Reader', tag: '零配置', tagColor: 'bg-green-50 text-green-600 border border-green-200' },
                    { icon: '📺', name: 'YouTube', desc: 'yt-dlp 字幕提取', tag: '零配置', tagColor: 'bg-green-50 text-green-600 border border-green-200' },
                    { icon: '📡', name: 'RSS', desc: 'feedparser', tag: '零配置', tagColor: 'bg-green-50 text-green-600 border border-green-200' },
                    { icon: '📦', name: 'GitHub', desc: 'gh CLI', tag: '零配置', tagColor: 'bg-green-50 text-green-600 border border-green-200' },
                    { icon: '🔍', name: '全网搜索', desc: 'Exa 语义搜索', tag: 'MCP 免费', tagColor: 'bg-teal-50 text-teal-700 border border-teal-200' },
                    { icon: '📺', name: 'B站', desc: 'bili-cli / OpenCLI', tag: '零配置', tagColor: 'bg-green-50 text-green-600 border border-green-200' },
                    { icon: '🐦', name: 'Twitter/X', desc: 'twitter-cli / OpenCLI', tag: '需 Cookie', tagColor: 'bg-amber-50 text-amber-600 border border-amber-200' },
                    { icon: '📖', name: 'Reddit', desc: 'OpenCLI / rdt-cli', tag: '需登录态', tagColor: 'bg-amber-50 text-amber-600 border border-amber-200' },
                    { icon: '📕', name: '小红书', desc: 'OpenCLI / xhs-cli', tag: '需登录态', tagColor: 'bg-amber-50 text-amber-600 border border-amber-200' },
                    { icon: '📘', name: 'Facebook', desc: 'OpenCLI', tag: '需登录态', tagColor: 'bg-amber-50 text-amber-600 border border-amber-200' },
                    { icon: '📷', name: 'Instagram', desc: 'OpenCLI', tag: '需登录态', tagColor: 'bg-amber-50 text-amber-600 border border-amber-200' },
                    { icon: '💼', name: 'LinkedIn', desc: 'linkedin-mcp / Jina', tag: '需登录态', tagColor: 'bg-amber-50 text-amber-600 border border-amber-200' },
                    { icon: '📈', name: '雪球', desc: '股票行情', tag: '需 Cookie', tagColor: 'bg-amber-50 text-amber-600 border border-amber-200' },
                    { icon: '🎙️', name: '小宇宙播客', desc: 'Groq Whisper 转录', tag: '需 Groq Key', tagColor: 'bg-teal-50 text-teal-700 border border-teal-200' },
                    { icon: '💻', name: 'V2EX', desc: '无需配置', tag: '零配置', tagColor: 'bg-green-50 text-green-600 border border-green-200' },
                  ].map(p => (
                    <div key={p.name} className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-100 hover:border-teal-200 hover:bg-teal-50/30 transition text-sm">
                      <span className="text-lg flex-shrink-0">{p.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-700 text-xs truncate">{p.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate">{p.desc}</div>
                        <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-medium ${p.tagColor}`}>{p.tag}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Current Routing */}
            <div className="app-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-700 text-sm">🔌 当前后端路由</h3>
                <p className="text-xs text-slate-400 mt-0.5">每个平台自动选最优后端，失效时自动切换</p>
              </div>
              <div className="p-5">
                <div className="space-y-2 text-xs font-mono">
                  {[
                    { platform: '网页', via: 'Jina Reader' },
                    { platform: 'YouTube', via: 'yt-dlp' },
                    { platform: 'B站（搜索+详情）', via: 'bili-cli (yt-dlp 已被 B站风控封死)' },
                    { platform: 'B站字幕', via: 'OpenCLI' },
                    { platform: '全网搜索', via: 'Exa via mcporter (MCP, 免费无需 Key)' },
                    { platform: 'GitHub', via: 'gh CLI' },
                    { platform: 'RSS', via: 'feedparser' },
                    { platform: 'Twitter', via: 'twitter-cli → OpenCLI (兜底)' },
                    { platform: '小红书', via: 'OpenCLI (桌面) → xiaohongshu-mcp (服务器)' },
                    { platform: 'Reddit', via: 'OpenCLI (桌面) → rdt-cli' },
                    { platform: 'Facebook / Instagram', via: 'OpenCLI (复用 Chrome 登录态)' },
                    { platform: 'LinkedIn', via: 'linkedin-mcp → Jina Reader' },
                    { platform: '雪球', via: 'Cookie-Editor / --from-browser chrome' },
                    { platform: '小宇宙播客', via: 'Groq Whisper (免费 Key)' },
                  ].map(r => (
                    <div key={r.platform} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                      <span className="w-28 text-slate-500 flex-shrink-0">{r.platform}</span>
                      <span className="text-slate-300">→</span>
                      <span className="text-slate-700 flex-1">{r.via}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Key Commands */}
            <div className="app-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-700 text-sm">🛠️ 常用命令</h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  {[
                    { cmd: 'agent-reach install --env=auto', desc: '一键安装核心渠道（零配置）' },
                    { cmd: 'agent-reach install --channels=all', desc: '安装全部渠道（含需登录态）' },
                    { cmd: 'agent-reach doctor', desc: '诊断所有渠道状态' },
                    { cmd: 'agent-reach check-update', desc: '检查新版本' },
                    { cmd: 'agent-reach configure twitter-cookies "..."', desc: '配置 Twitter Cookie' },
                    { cmd: 'agent-reach configure groq-key gsk_xxx', desc: '配置小宇宙转录 Key' },
                    { cmd: 'agent-reach uninstall', desc: '卸载所有' },
                  ].map(c => (
                    <div key={c.cmd} className="flex items-start gap-3 app-panel rounded-lg px-3 py-2.5">
                      <code className="text-teal-700 flex-shrink-0">{c.cmd}</code>
                      <span className="text-slate-400">— {c.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Why Agent Reach */}
            <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-700 text-sm mb-3">💡 为什么需要 Agent Reach</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                {[
                  { title: '完全免费', desc: '所有工具开源、所有 API 免费。仅服务器代理 ~$1/月' },
                  { title: '隐私安全', desc: 'Cookie 只存本地 ~/.agent-reach/，不上传不外传' },
                  { title: '持续换代', desc: '平台封了自动换下一个后端，零操作（如 yt-dlp 被 B站封 → 切 bili-cli）' },
                  { title: '兼容所有 Agent', desc: 'Claude Code、OpenClaw、Cursor、Windsurf…任何能跑命令行的 Agent 都能用' },
                  { title: '自带诊断', desc: 'agent-reach doctor 一条命令告诉你哪个通、哪个不通' },
                  { title: '安全模式', desc: '--safe 不修改系统，只列需求；--dry-run 预览所有操作' },
                ].map(item => (
                  <div key={item.title} className="app-card p-3 border border-slate-100">
                    <div className="font-medium text-slate-700 mb-1">{item.title}</div>
                    <div className="text-slate-400">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'list' && (
          <div>
            {jobs.length === 0 ? (
              <div className="app-card p-8 text-center text-slate-400">
                暂无采集任务，切换到「新建任务」创建一个吧
              </div>
            ) : (
              <div className="app-card overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
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
                                className="text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded hover:bg-teal-100"
                              >
                                运行
                              </button>
                            )}
                            {job.status === 'running' && (
                              <span className="text-xs px-2 py-1 bg-teal-50 text-blue-400 rounded">采集中</span>
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
                                className="text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded hover:bg-teal-100 disabled:opacity-50"
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
          <div className="app-card shadow-[0_30px_90px_rgba(39,32,24,0.18)] max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                    <div className="app-panel rounded-lg p-3">
                      <div className="text-slate-400 mb-1">状态</div>
                      <StatusBadge status={detailData.job.status} />
                    </div>
                    <div className="app-panel rounded-lg p-3">
                      <div className="text-slate-400 mb-1">采集结果</div>
                      <div className="text-slate-700 font-medium">{detailData.job.resultCount} 条</div>
                    </div>
                    <div className="app-panel rounded-lg p-3">
                      <div className="text-slate-400 mb-1">关键词</div>
                      <div className="text-slate-700 truncate">{detailData.job.keyword || detailData.job.targetUrl || '-'}</div>
                    </div>
                    <div className="app-panel rounded-lg p-3">
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
                          <div key={item.id} className="app-panel rounded-lg p-3 border border-slate-100">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">{item.title || '无标题'}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{item.authorName} · {item.publishTime || '-'}</div>
                                {item.content && (
                                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{String(item.content).slice(0, 150)}</div>
                                )}
                              </div>
                              {item.url && (
                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 text-xs flex-shrink-0">↗</a>
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
                      <div className="app-panel rounded-lg p-4 border border-slate-100">
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{analyzeResult}</pre>
                      </div>
                      <div className="mt-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(analyzeResult); alert('已复制'); }}
                          className="text-xs px-3 py-1.5 app-button-secondary rounded-lg text-slate-600"
                        >
                          复制 Markdown
                        </button>
                      </div>
                    </div>
                  )}

                  {!analyzeResult && detailData.report?.markdown && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">AI 分析报告（已保存）</h4>
                      <div className="app-panel rounded-lg p-4 border border-slate-100">
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{detailData.report.markdown}</pre>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    {detailData.job.status === 'success' && detailData.job.resultCount > 0 && !analyzeResult && (
                      <button
                        onClick={() => handleAnalyze(detailData.job.id)}
                        disabled={analyzing}
                        className="px-4 py-2 app-button-primary rounded-lg text-sm disabled:opacity-50"
                      >
                        {analyzing ? '分析中（120s超时）...' : '生成 AI 分析报告'}
                      </button>
                    )}
                    {analyzeResult && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(analyzeResult); alert('已复制'); }}
                        className="px-4 py-2 app-input rounded-lg text-sm text-slate-600 hover:bg-slate-50"
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