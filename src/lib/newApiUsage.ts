// @ts-nocheck
/**
 * new-api 使用情况统计适配层
 *
 * 探测结论：
 * - new-api 跑在生产服务器，开发机通过 tailscale 访问
 * - 鉴权用 `Authorization: Bearer <access_token>`
 * - 可用 self 接口（用户 access token）：
 *   GET /api/user/self       → 用户信息（余额/已用额度）
 *   GET /api/log/self        → 调用日志（分页）
 *   GET /api/log/self/stat   → 日志统计
 *   GET /api/data/self       → 数据仪表盘
 * - 第一版只走 HTTP API，不接数据库
 *
 * 安全：
 * - 不打印 token / Authorization header
 * - 所有 fetch 10s 超时
 * - 每个接口独立 try/catch，单点失败不阻塞整体
 */

export interface NewApiUsageSummary {
  balance: number | null;        // 当前余额（货币，display_in_currency=true 时）
  usedToday: number | null;      // 今日消耗
  used7d: number | null;         // 7 日消耗
  used30d: number | null;        // 30 日消耗
  requestCountToday: number | null;
  tokenCountToday: number | null;
}

export interface NewApiDailyItem {
  date: string;       // YYYY-MM-DD
  cost: number;
  requests: number;
  tokens: number;
}

export interface NewApiByModelItem {
  model: string;
  cost: number;
  requests: number;
  tokens: number;
}

export interface NewApiByChannelItem {
  channel: string;
  cost: number;
  requests: number;
  tokens: number;
}

export interface NewApiRecentLog {
  time: string;       // YYYY-MM-DD HH:MM:SS
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  status: 'success' | 'error';
}

export interface NewApiUsageResult {
  configured: boolean;
  source: 'http_api' | 'none';
  baseUrl: string | null;
  summary: NewApiUsageSummary | null;
  daily: NewApiDailyItem[];
  byModel: NewApiByModelItem[];
  byChannel: NewApiByChannelItem[];
  recentLogs: NewApiRecentLog[];
  error: string | null;
}

const RANGE_TO_DAYS: Record<string, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
};

/**
 * 获取 new-api base url
 * 优先 NEW_API_BASE_URL
 * 其次从 AI_BASE_URL 去掉 /v1 推导
 * 默认 http://127.0.0.1:12345
 */
export function getNewApiBaseUrl(): string {
  const explicit = (process.env.NEW_API_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  if (aiBaseUrl) {
    // http://127.0.0.1:12345/v1 → http://127.0.0.1:12345
    return aiBaseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  }
  return 'http://127.0.0.1:12345';
}

function isConfigured(): boolean {
  return !!(process.env.NEW_API_ADMIN_TOKEN || '').trim();
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * 带 10s 超时的 fetch
 */
async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('new-api 请求超时（10s）');
    }
    throw new Error(`new-api 请求失败: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 安全的 quota → 货币转换
 * new-api 通常以 quota 单位存储，1 美元 = 500000 quota（默认）
 * 如果 status.display_in_currency=true，前端显示货币；否则显示 quota
 */
function quotaToCurrency(quota: number, exchangeRate: number): number {
  if (!exchangeRate || exchangeRate <= 0) exchangeRate = 500000;
  return quota / exchangeRate;
}

/**
 * 格式化时间为 YYYY-MM-DD HH:MM:SS
 */
function formatTime(unixSeconds: number): string {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

/**
 * 格式化为 YYYY-MM-DD
 */
function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoStr(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 获取 new-api 使用情况
 */
export async function getNewApiUsage(range: 'today' | '7d' | '30d' = '7d', date?: string): Promise<NewApiUsageResult> {
  const token = (process.env.NEW_API_ADMIN_TOKEN || '').trim();
  const baseUrl = getNewApiBaseUrl();

  if (!token) {
    return {
      configured: false,
      source: 'none',
      baseUrl,
      summary: null,
      daily: [],
      byModel: [],
      byChannel: [],
      recentLogs: [],
      error: 'NEW_API_ADMIN_TOKEN 未配置',
    };
  }

  const days = RANGE_TO_DAYS[range] || 7;
  const headers = buildHeaders(token);

  // 并行调用多个接口，每个独立容错
  const [userSelfRes, logSelfRes, statRes, dataSelfRes] = await Promise.allSettled([
    fetchWithTimeout(`${baseUrl}/api/user/self`, headers),
    fetchWithTimeout(`${baseUrl}/api/log/self?p=0&per_page=100`, headers),
    fetchWithTimeout(`${baseUrl}/api/log/self/stat`, headers),
    fetchWithTimeout(`${baseUrl}/api/data/self`, headers),
  ]);

  // 检查鉴权是否失败（所有接口都返回 invalid token）
  const allFailed = [userSelfRes, logSelfRes, statRes, dataSelfRes].every(
    (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value && r.value.success === false)
  );
  if (allFailed) {
    // 看是否有鉴权错误
    const firstResolved = [userSelfRes, logSelfRes, statRes, dataSelfRes].find(
      (r) => r.status === 'fulfilled' && r.value
    ) as PromiseFulfilledResult<any> | undefined;
    if (firstResolved?.value?.message?.includes('access token')) {
      return {
        configured: true,
        source: 'http_api',
        baseUrl,
        summary: null,
        daily: [],
        byModel: [],
        byChannel: [],
        recentLogs: [],
        error: 'new-api access token 无效',
      };
    }
    const firstRejected = [userSelfRes, logSelfRes, statRes, dataSelfRes].find(
      (r) => r.status === 'rejected'
    ) as PromiseRejectedResult | undefined;
    return {
      configured: true,
      source: 'http_api',
      baseUrl,
      summary: null,
      daily: [],
      byModel: [],
      byChannel: [],
      recentLogs: [],
      error: firstRejected?.reason?.message || '无法连接 new-api',
    };
  }

  // 解析各接口数据
  const userSelf = userSelfRes.status === 'fulfilled' ? userSelfRes.value : null;
  const logSelf = logSelfRes.status === 'fulfilled' ? logSelfRes.value : null;
  const stat = statRes.status === 'fulfilled' ? statRes.value : null;
  const dataSelf = dataSelfRes.status === 'fulfilled' ? dataSelfRes.value : null;

  // 获取汇率（从 userSelf 或默认 500000）
  let exchangeRate = 500000;
  let displayInCurrency = true;
  if (userSelf?.data) {
    // new-api 用户对象有时带 quota 字段，汇率从 /api/status 拿（这里用默认）
  }

  // === 解析 summary ===
  const summary: NewApiUsageSummary = {
    balance: null,
    usedToday: null,
    used7d: null,
    used30d: null,
    requestCountToday: null,
    tokenCountToday: null,
  };

  if (userSelf?.data && userSelf.success !== false) {
    const u = userSelf.data;
    // quota 是剩余，used_quota 是已用
    if (typeof u.quota === 'number') {
      summary.balance = quotaToCurrency(u.quota, exchangeRate);
    }
    if (typeof u.used_quota === 'number') {
      // used_quota 是累计已用，不是今日；今日需要从日志聚合
      // 暂存累计，后面从日志算今日
    }
    if (typeof u.request_count === 'number') {
      // 累计请求数，不是今日
    }
  }

  // === 解析 recentLogs + 聚合 daily/byModel/byChannel/今日统计 ===
  let recentLogs: NewApiRecentLog[] = [];
  const dailyMap = new Map<string, { cost: number; requests: number; tokens: number }>();
  const byModelMap = new Map<string, { cost: number; requests: number; tokens: number }>();
  const byChannelMap = new Map<string, { cost: number; requests: number; tokens: number }>();
  let todayCost = 0;
  let todayRequests = 0;
  let todayTokens = 0;
  let cost7d = 0;
  let cost30d = 0;
  const today = todayStr();
  const d7 = daysAgoStr(7);
  const d30 = daysAgoStr(30);

  if (logSelf?.data && logSelf.success !== false) {
    const items = Array.isArray(logSelf.data) ? logSelf.data : (logSelf.data.items || logSelf.data.logs || []);
    for (const log of items) {
      const ts = log.created_at || log.CreatedAt || log.timestamp;
      if (!ts) continue;
      const dateStr = formatDate(Number(ts));
      const fullTime = formatTime(Number(ts));
      const model = String(log.model_name || log.model || '');
      const promptTokens = Number(log.prompt_tokens || 0);
      const completionTokens = Number(log.completion_tokens || 0);
      const totalTokens = Number(log.use_tokens || log.total_tokens || (promptTokens + completionTokens));
      const quotaCost = Number(log.quota || log.used_quota || 0);
      const cost = quotaToCurrency(quotaCost, exchangeRate);
      const channelName = String(log.channel_name || log.channel_id || 'unknown');
      const status: 'success' | 'error' = log.type === 'error' || log.status === 'error' ? 'error' : 'success';

      // recentLogs（最多 20 条，倒序）
      recentLogs.push({
        time: fullTime,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
        status,
      });

      // daily 聚合
      if (dateStr) {
        const cur = dailyMap.get(dateStr) || { cost: 0, requests: 0, tokens: 0 };
        cur.cost += cost;
        cur.requests += 1;
        cur.tokens += totalTokens;
        dailyMap.set(dateStr, cur);
      }

      // byModel 聚合
      if (model) {
        const cur = byModelMap.get(model) || { cost: 0, requests: 0, tokens: 0 };
        cur.cost += cost;
        cur.requests += 1;
        cur.tokens += totalTokens;
        byModelMap.set(model, cur);
      }

      // byChannel 聚合
      const chKey = channelName || 'unknown';
      const curCh = byChannelMap.get(chKey) || { cost: 0, requests: 0, tokens: 0 };
      curCh.cost += cost;
      curCh.requests += 1;
      curCh.tokens += totalTokens;
      byChannelMap.set(chKey, curCh);

      // 今日聚合
      if (dateStr === today) {
        todayCost += cost;
        todayRequests += 1;
        todayTokens += totalTokens;
      }

      // 7d / 30d
      if (dateStr >= d7) cost7d += cost;
      if (dateStr >= d30) cost30d += cost;
    }

    // recentLogs 倒序取前 20
    recentLogs = recentLogs
      .sort((a, b) => (a.time < b.time ? 1 : -1))
      .slice(0, 20);
  }

  // 填充 summary（如果日志聚合成功，用日志算的；否则用 user_self 的累计）
  if (todayRequests > 0 || summary.balance !== null) {
    summary.usedToday = todayCost;
    summary.used7d = cost7d;
    summary.used30d = cost30d;
    summary.requestCountToday = todayRequests;
    summary.tokenCountToday = todayTokens;
  }

  // === 尝试用 stat / data_self 补全（如果日志聚合没拿到数据）===
  if (stat?.data && stat.success !== false) {
    // stat 可能返回更准确的聚合数据，但字段名不确定
    // 这里只在日志聚合为空时尝试用 stat
    if (dailyMap.size === 0 && Array.isArray(stat.data)) {
      for (const item of stat.data) {
        const dateStr = item.date || item.day || formatDate(item.created_at);
        if (!dateStr) continue;
        dailyMap.set(dateStr, {
          cost: quotaToCurrency(Number(item.quota || item.cost || 0), exchangeRate),
          requests: Number(item.count || item.requests || 0),
          tokens: Number(item.tokens || 0),
        });
      }
    }
  }

  // === 构造返回 ===
  const daily: NewApiDailyItem[] = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);

  const byModel: NewApiByModelItem[] = Array.from(byModelMap.entries())
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 15);

  const byChannel: NewApiByChannelItem[] = Array.from(byChannelMap.entries())
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 15);

  return {
    configured: true,
    source: 'http_api',
    baseUrl,
    summary,
    daily,
    byModel,
    byChannel,
    recentLogs,
    error: null,
  };
}
