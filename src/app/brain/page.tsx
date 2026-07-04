'use client';
import { useState, useEffect, useCallback } from 'react';
import NavBar from '@/components/NavBar';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface BrainStatus {
  configured: boolean;
  credentialsSet: boolean;
  lastSyncAt: string | null;
  unsubmittedCount: number;
  submittedCount: number;
  userInfo: {
    user_id: string;
    email: string;
    display_name: string;
    last_sync_at: string;
  } | null;
}

interface Alpha {
  id: string;
  status: string;
  stage: string;
  grade: string;
  type: string;
  expression: string;
  sharpe: string;
  fitness: string;
  turnover: string;
  returns: string;
  drawdown: string;
  margin: string;
  pnl: string;
  book_size: string;
  long_count: number;
  short_count: number;
  start_date: string;
  checks_json: string;
  date_submitted: string | null;
  self_corr_max: string | null;
  synced_at: string;
  // 详情接口额外字段
  settings_json?: string;
  raw_json?: string;
}

interface Check {
  name: string;
  result: string; // PASS | FAIL | WARNING | PENDING | NONE
  limit: number | null;
  value: number | null;
  competitions?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function num(s: string | null | undefined): string {
  if (s === null || s === undefined || s === '') return '-';
  const f = parseFloat(s);
  if (isNaN(f)) return s;
  return Math.abs(f) >= 1000 ? f.toFixed(0) : f.toFixed(4);
}

function parseChecks(checksJson: string): Check[] {
  try {
    return JSON.parse(checksJson || '[]');
  } catch {
    return [];
  }
}

function parseSettings(settingsJson: string): Record<string, any> {
  try {
    return JSON.parse(settingsJson || '{}');
  } catch {
    return {};
  }
}

function checksSummary(checksJson: string): { p: number; f: number; w: number; pend: number } {
  const checks = parseChecks(checksJson);
  return {
    p: checks.filter((c) => c.result === 'PASS').length,
    f: checks.filter((c) => c.result === 'FAIL').length,
    w: checks.filter((c) => c.result === 'WARNING').length,
    pend: checks.filter((c) => c.result === 'PENDING' || c.result === 'NONE').length,
  };
}

// ─── UI Components ─────────────────────────────────────────────────────────────
const CHECK_COLORS: Record<string, string> = {
  PASS: 'bg-green-100 text-green-700',
  FAIL: 'bg-red-100 text-red-700',
  WARNING: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-slate-100 text-slate-600',
  NONE: 'bg-slate-100 text-slate-600',
};

function CheckBadge({ result }: { result: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        CHECK_COLORS[result] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {result}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    UNSUBMITTED: { label: '未提交', cls: 'bg-amber-100 text-amber-700' },
    ACTIVE: { label: '已提交', cls: 'bg-green-100 text-green-700' },
  };
  const m = map[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.cls}`}>{m.label}</span>
  );
}

function MetricCell({ value, warnIfAbs }: { value: string | null | undefined; warnIfAbs?: number }) {
  if (!value) return <span className="text-slate-300">-</span>;
  const f = parseFloat(value);
  if (isNaN(f)) return <span className="text-xs">{value}</span>;
  const cls =
    warnIfAbs !== undefined && Math.abs(f) > warnIfAbs
      ? 'text-red-600 font-medium'
      : '';
  return <span className={`tabular-nums ${cls}`}>{num(value)}</span>;
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function BrainPage() {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [tab, setTab] = useState<'unsubmitted' | 'submitted' | 'userinfo'>('unsubmitted');
  const [alphas, setAlphas] = useState<Alpha[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [selectedAlpha, setSelectedAlpha] = useState<Alpha | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/brain/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('fetch status failed:', err);
    }
  }, []);

  const fetchAlphas = useCallback(
    async (statusFilter: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/brain/alphas?status=${statusFilter}&limit=200`
        );
        const data = await res.json();
        setAlphas(data.alphas || []);
      } catch (err) {
        console.error('fetch alphas failed:', err);
        setAlphas([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (tab === 'unsubmitted') fetchAlphas('UNSUBMITTED');
    else if (tab === 'submitted') fetchAlphas('ACTIVE');
  }, [tab, fetchAlphas]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/brain/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSyncError(data.error || `同步失败: HTTP ${res.status}`);
      } else {
        setSyncMsg(
          `同步完成：未提交 ${data.unsubmitted} 个，已提交 ${data.submitted} 个${
            data.userInfo ? '，用户信息已更新' : ''
          }`
        );
        await fetchStatus();
        if (tab === 'unsubmitted') fetchAlphas('UNSUBMITTED');
        else if (tab === 'submitted') fetchAlphas('ACTIVE');
      }
    } catch (err: any) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
      setTimeout(() => {
        setSyncMsg(null);
        setSyncError(null);
      }, 8000);
    }
  };

  const openDetail = async (alphaId: string) => {
    setDetailLoading(true);
    setSelectedAlpha(null);
    try {
      const res = await fetch(`/api/brain/alphas/${alphaId}`);
      const data = await res.json();
      if (data.ok) setSelectedAlpha(data.alpha);
    } catch (err) {
      console.error('fetch alpha detail failed:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const currentStatusFilter =
    tab === 'unsubmitted' ? 'UNSUBMITTED' : tab === 'submitted' ? 'ACTIVE' : '';

  return (
    <div className="page-shell flex flex-col">
      <NavBar title="🧠 WorldQuant BRAIN" />

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* 状态栏 */}
        <div className="app-card p-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">配置:</span>
              {status?.configured ? (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                  已配置
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                  未配置
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">未提交:</span>
              <span className="text-sm font-medium text-amber-700">
                {status?.unsubmittedCount ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">已提交:</span>
              <span className="text-sm font-medium text-green-700">
                {status?.submittedCount ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">最后同步:</span>
              <span className="text-xs text-slate-600">
                {formatTime(status?.lastSyncAt ?? null)}
              </span>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing || !status?.configured}
              className="ml-auto px-3 py-1.5 rounded text-xs font-medium app-button-primary  disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {syncing ? '同步中…' : '同步 BRAIN'}
            </button>
          </div>
          {syncMsg && (
            <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
              {syncMsg}
            </div>
          )}
          {syncError && (
            <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              {syncError}
            </div>
          )}
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-4 border-b border-slate-200">
          {[
            { key: 'unsubmitted', label: `未提交 (${status?.unsubmittedCount ?? 0})` },
            { key: 'submitted', label: `已提交 (${status?.submittedCount ?? 0})` },
            { key: 'userinfo', label: '个人信息' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-teal-700 text-teal-700 font-medium'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        {tab === 'userinfo' ? (
          <UserInfoPanel status={status} />
        ) : (
          <AlphaTable
            alphas={alphas}
            loading={loading}
            onOpenDetail={openDetail}
          />
        )}

        {/* 详情 Modal */}
        {(selectedAlpha || detailLoading) && (
          <AlphaDetailModal
            alpha={selectedAlpha}
            loading={detailLoading}
            onClose={() => {
              setSelectedAlpha(null);
              setDetailLoading(false);
            }}
          />
        )}
      </main>
    </div>
  );
}

// ─── Alpha Table ────────────────────────────────────────────────────────────────
function AlphaTable({
  alphas,
  loading,
  onOpenDetail,
}: {
  alphas: Alpha[];
  loading: boolean;
  onOpenDetail: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="app-card p-8 text-center text-sm text-slate-400">
        加载中…
      </div>
    );
  }
  if (alphas.length === 0) {
    return (
      <div className="app-card p-8 text-center text-sm text-slate-400">
        暂无数据，请点击右上角「同步 BRAIN」拉取
      </div>
    );
  }
  return (
    <div className="app-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-slate-600">
              <th className="px-3 py-2 font-medium">Expression</th>
              <th className="px-2 py-2 font-medium">Sharpe</th>
              <th className="px-2 py-2 font-medium">Fitness</th>
              <th className="px-2 py-2 font-medium">Turnover</th>
              <th className="px-2 py-2 font-medium">Returns</th>
              <th className="px-2 py-2 font-medium">Drawdown</th>
              <th className="px-2 py-2 font-medium">Margin</th>
              <th className="px-2 py-2 font-medium">Checks</th>
              <th className="px-2 py-2 font-medium">SelfCorr</th>
              <th className="px-2 py-2 font-medium">同步时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {alphas.map((a) => {
              const cs = checksSummary(a.checks_json);
              return (
                <tr
                  key={a.id}
                  onClick={() => onOpenDetail(a.id)}
                  className="hover:bg-teal-50 cursor-pointer"
                >
                  <td className="px-3 py-2 font-mono text-xs max-w-xs truncate" title={a.expression}>
                    {truncate(a.expression, 60)}
                  </td>
                  <td className="px-2 py-2"><MetricCell value={a.sharpe} /></td>
                  <td className="px-2 py-2"><MetricCell value={a.fitness} /></td>
                  <td className="px-2 py-2"><MetricCell value={a.turnover} /></td>
                  <td className="px-2 py-2"><MetricCell value={a.returns} /></td>
                  <td className="px-2 py-2"><MetricCell value={a.drawdown} /></td>
                  <td className="px-2 py-2"><MetricCell value={a.margin} /></td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className="text-green-700">P:{cs.p}</span>{' '}
                    <span className="text-red-700">F:{cs.f}</span>{' '}
                    <span className="text-amber-700">W:{cs.w}</span>
                  </td>
                  <td className="px-2 py-2">
                    <MetricCell value={a.self_corr_max} warnIfAbs={0.7} />
                  </td>
                  <td className="px-2 py-2 text-slate-500 whitespace-nowrap">
                    {formatTime(a.synced_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── User Info Panel ────────────────────────────────────────────────────────────
function UserInfoPanel({ status }: { status: BrainStatus | null }) {
  if (!status?.userInfo) {
    return (
      <div className="app-card p-8 text-center text-sm text-slate-400">
        暂无个人信息，请先点击「同步 BRAIN」
      </div>
    );
  }
  const u = status.userInfo;
  return (
    <div className="app-card p-6">
      <h3 className="text-sm font-medium text-slate-700 mb-4">个人信息</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-slate-500">User ID</div>
          <div className="text-slate-800 font-mono">{u.user_id || '-'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Email</div>
          <div className="text-slate-800">{u.email || '-'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Display Name</div>
          <div className="text-slate-800">{u.display_name || '-'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">最后同步</div>
          <div className="text-slate-800">{formatTime(u.last_sync_at)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ───────────────────────────────────────────────────────────────
function AlphaDetailModal({
  alpha,
  loading,
  onClose,
}: {
  alpha: Alpha | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="app-card max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-medium text-slate-800">Alpha 详情</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        {loading || !alpha ? (
          <div className="p-8 text-center text-sm text-slate-400">加载中…</div>
        ) : (
          <AlphaDetailContent alpha={alpha} />
        )}
      </div>
    </div>
  );
}

function AlphaDetailContent({ alpha }: { alpha: Alpha }) {
  const checks = parseChecks(alpha.checks_json);
  const settings = parseSettings(alpha.settings_json || '{}');
  const metrics: { label: string; value: string }[] = [
    { label: 'Sharpe', value: alpha.sharpe },
    { label: 'Fitness', value: alpha.fitness },
    { label: 'Turnover', value: alpha.turnover },
    { label: 'Returns', value: alpha.returns },
    { label: 'Drawdown', value: alpha.drawdown },
    { label: 'Margin', value: alpha.margin },
    { label: 'PnL', value: alpha.pnl },
    { label: 'Book Size', value: alpha.book_size },
    { label: 'Long Count', value: String(alpha.long_count) },
    { label: 'Short Count', value: String(alpha.short_count) },
    { label: 'Start Date', value: alpha.start_date },
    { label: 'Date Submitted', value: alpha.date_submitted || '' },
  ];
  const settingFields = [
    'instrumentType',
    'region',
    'universe',
    'delay',
    'decay',
    'neutralization',
    'truncation',
    'pasteurization',
  ];

  return (
    <div className="p-5 space-y-4">
      {/* 基本信息 */}
      <div className="flex flex-wrap gap-3 items-center">
        <StatusBadge status={alpha.status} />
        <span className="text-xs text-slate-500">ID:</span>
        <span className="text-xs font-mono text-slate-700">{alpha.id}</span>
        {alpha.stage && (
          <>
            <span className="text-xs text-slate-500">Stage:</span>
            <span className="text-xs text-slate-700">{alpha.stage}</span>
          </>
        )}
        {alpha.grade && (
          <>
            <span className="text-xs text-slate-500">Grade:</span>
            <span className="text-xs text-slate-700">{alpha.grade}</span>
          </>
        )}
        {alpha.type && (
          <>
            <span className="text-xs text-slate-500">Type:</span>
            <span className="text-xs text-slate-700">{alpha.type}</span>
          </>
        )}
      </div>

      {/* Expression */}
      <div>
        <div className="text-xs text-slate-500 mb-1">Expression</div>
        <pre className="bg-slate-900 text-slate-100 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
          {alpha.expression || '(空)'}
        </pre>
      </div>

      {/* Settings */}
      <div>
        <div className="text-xs text-slate-500 mb-1">Settings</div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {settingFields.map((f) => (
            <div key={f} className="app-panel rounded px-2 py-1">
              <span className="text-slate-500">{f}: </span>
              <span className="text-slate-800 font-mono">
                {settings[f] != null ? String(settings[f]) : '-'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 指标 */}
      <div>
        <div className="text-xs text-slate-500 mb-1">指标</div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {metrics.map((m) => (
            <div key={m.label} className="app-panel rounded px-2 py-1">
              <span className="text-slate-500">{m.label}: </span>
              <span className="text-slate-800 font-mono">
                {m.value || '-'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Self Correlation */}
      {alpha.self_corr_max !== null && (
        <div>
          <div className="text-xs text-slate-500 mb-1">Self Correlation (max)</div>
          <div className="text-sm">
            <MetricCell value={alpha.self_corr_max} warnIfAbs={0.7} />
            <span className="ml-2 text-xs text-slate-400">阈值 0.7</span>
          </div>
        </div>
      )}

      {/* Checks */}
      <div>
        <div className="text-xs text-slate-500 mb-1">Checks</div>
        {checks.length === 0 ? (
          <p className="text-xs text-slate-400">无</p>
        ) : (
          <div className="space-y-1">
            {checks.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-xs app-panel rounded px-2 py-1"
              >
                <CheckBadge result={c.result} />
                <span className="text-slate-700">{c.name}</span>
                {c.value !== null && c.value !== undefined && (
                  <span className="text-slate-500 font-mono">
                    value: {c.value}
                  </span>
                )}
                {c.limit !== null && c.limit !== undefined && (
                  <span className="text-slate-500 font-mono">
                    limit: {c.limit}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
