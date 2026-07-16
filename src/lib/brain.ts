// @ts-nocheck
/**
 * WorldQuant BRAIN API 集成
 *
 * 通过 HTTP Basic Auth 登录 api.worldquantbrain.com，同步未提交/已提交 alpha
 * 数据和个人信息到本地 SQLite。cookie/session 手动维护（Node.js fetch 不自动管 cookie）。
 */

import { db, sqlite, initDb } from './db/index';
import { brainAlphas, brainUserInfo } from './db/schema';
import { eq } from 'drizzle-orm';

const BRAIN_API_URL = (
  process.env.BRAIN_API_URL || 'https://api.worldquantbrain.com'
).replace(/\/$/, '');

// ─── 模块级 cookie jar + session 过期时间 ───────────────────────────────────
// Node.js fetch 不自动管 cookie，手动捕获 Set-Cookie 并回传
let cookieStr = '';
let sessionExpiry = 0; // epoch ms
let syncInProgress = false; // 防止并发 sync

export function isBrainConfigured(): boolean {
  return !!(process.env.BRAIN_CREDENTIAL_EMAIL && process.env.BRAIN_CREDENTIAL_PASSWORD);
}

function parseSetCookie(headers: Headers): string {
  const setCookies = headers.getSetCookie?.() || [];
  const map = new Map<string, string>();
  // 解析已有 cookie
  for (const c of cookieStr.split('; ')) {
    const idx = c.indexOf('=');
    if (idx > 0) map.set(c.slice(0, idx), c.slice(idx + 1));
  }
  // 解析新 Set-Cookie（只取 name=value，忽略 Path/Domain/Expires 等属性）
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 登录 BRAIN。HTTP Basic Auth POST /authentication。
 * 201 = 成功；401 + WWW-Authenticate: persona = 需生物认证。
 */
export async function loginBrain(): Promise<{
  ok: boolean;
  error?: string;
  biometrics?: boolean;
}> {
  const email = process.env.BRAIN_CREDENTIAL_EMAIL;
  const password = process.env.BRAIN_CREDENTIAL_PASSWORD;
  if (!email || !password) {
    return { ok: false, error: 'BRAIN_CREDENTIAL_EMAIL/PASSWORD not set' };
  }

  const basic = Buffer.from(`${email}:${password}`).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${BRAIN_API_URL}/authentication`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 201 || res.status === 204) {
      // 201=新会话, 204=已有有效会话
      const data = await res.json().catch(() => ({}));
      cookieStr = parseSetCookie(res.headers);
      const expiry = typeof data?.token?.expiry === 'number' ? data.token.expiry * 1000 : 3600 * 1000;
      sessionExpiry = Date.now() + expiry;
      console.log('[brain] login ok, user:', data?.user);
      return {
        ok: true,
        user: data?.user ?? null,
      };
    }
    if (res.status === 401) {
      const wwwAuth = res.headers.get('www-authenticate') || '';
      if (wwwAuth.includes('persona')) {
        return {
          ok: false,
          biometrics: true,
          error:
            '需要生物认证 (biometrics/persona)，请在浏览器登录 platform.worldquantbrain.com 完成认证后重试',
        };
      }
      return { ok: false, error: '认证失败：邮箱或密码错误' };
    }
    console.log('[brain] login failed, status:', res.status, await res.text().catch(()=>''));
    return { ok: false, error: `登录失败: HTTP ${res.status}` };
  } catch (err: any) {
    clearTimeout(timeout);
    console.log('[brain] login exception:', err.name, err.message);
    if (err.name === 'AbortError') return { ok: false, error: '登录超时（30s）' };
    return { ok: false, error: `登录异常: ${err.message}` };
  }
}

/**
 * 检查 session，过期则重新登录。
 */
async function ensureSession(): Promise<{
  ok: boolean;
  error?: string;
  biometrics?: boolean;
}> {
  if (!cookieStr || Date.now() > sessionExpiry) {
    return loginBrain();
  }
  try {
    const res = await brainGet('/authentication');
    if (res.ok) {
      const data = await res.json();
      const expiry = data?.token?.expiry ?? 0;
      if (expiry > 2000) {
        sessionExpiry = Date.now() + expiry * 1000;
        return { ok: true };
      }
    }
    return loginBrain();
  } catch {
    return loginBrain();
  }
}

/**
 * BRAIN GET 请求，带 cookie + 重试处理。
 * 对 429/500-503/timeout/网络错误都会重试，最多 3 次。
 */
async function brainGet(path: string): Promise<Response> {
  const url = path.startsWith('http') ? path : `${BRAIN_API_URL}${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(url, {
        headers: { Cookie: cookieStr },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 429 || (res.status >= 500 && res.status <= 503)) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
        console.log(`[brainGet] ${path} → ${res.status} retry-after=${retryAfter}s (attempt ${attempt + 1}/3)`);
        await sleep(Math.min(retryAfter * 1000, 30000));
        continue;
      }
      // 更新 cookie（以防 session 刷新）
      if (res.headers.getSetCookie?.()?.length) {
        cookieStr = parseSetCookie(res.headers);
      }
      return res;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error(`请求超时: ${path}`);
      if (attempt === 2) throw err;
      await sleep(2000);
    }
  }
  throw new Error(`BRAIN GET 重试耗尽: ${path}`);
}

/**
 * 分页拉取 alphas。
 * 策略：先用 order=-dateCreated&limit=50；遇到超时或 500 则降级到 limit=20 无 order。
 */
async function fetchAlphasByStatus(
  status: 'UNSUBMITTED' | 'ACTIVE'
): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const order = status === 'UNSUBMITTED' ? '-dateCreated' : '-dateSubmitted';
  const extra = status === 'UNSUBMITTED' ? '&hidden=false' : '';
  let useOrder = true;
  let batchSize = 50;
  const MAX_ESTIMATE = 10000;
  const LOG_INTERVAL = 10;

  while (true) {
    const orderParam = useOrder ? `&order=${order}` : '';
    const path = `/users/self/alphas?limit=${batchSize}&offset=${offset}&status=${status}${orderParam}${extra}`;
    console.log(`[brain] fetchAlphas ${status} offset=${offset} order=${useOrder} limit=${batchSize}`);

    try {
      const res = await brainGet(path);
      console.log(`[brain] fetchAlphas ${status} offset=${offset} → ${res.status} ${res.ok}`);

      if (res.ok) {
        const data = await res.json();
        const batch: any[] = data?.results || [];
        all.push(...batch);

        const totalEstimate = data?.count || all.length + offset;
        if (offset % (LOG_INTERVAL * batchSize) === 0 && offset > 0) {
          console.log(`[brain] fetched ${all.length}/${totalEstimate} ${status}`);
        }

        if (batch.length < batchSize) {
          console.log(`[brain] fetchAlphas ${status} done, total=${all.length}`);
          break;
        }
        offset += batch.length;
      } else if (res.status === 500 || res.status === 503) {
        // 服务端错误：降级策略
        if (useOrder) {
          console.log(`[brain] 500, 降级到无 order, limit=20`);
          useOrder = false;
          batchSize = 20;
          offset = 0; // 重新开始
          all.length = 0;
          continue;
        }
        throw new Error(`fetchAlphas ${status} HTTP ${res.status} (after fallback)`);
      } else {
        throw new Error(`fetchAlphas ${status} HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      }
    } catch (err: any) {
      if (err.message.includes('请求超时')) {
        // 超时：切换无 order 模式
        if (useOrder || batchSize > 10) {
          console.log(`[brain] 超时，切换到小批量模式 batchSize=20`);
          useOrder = false;
          batchSize = 20;
          if (offset > 0) {
            offset = Math.max(0, offset - 50); // 回退 offset
          }
          continue;
        }
        throw err;
      }
      throw err;
    }
  }
  return all;
}

/**
 * 获取单个 alpha 详情（从 BRAIN API 实时拉取）。
 */
export async function fetchAlphaDetail(alphaId: string): Promise<any | null> {
  const session = await ensureSession();
  if (!session.ok) throw new Error(session.error);

  const res = await brainGet(`/alphas/${alphaId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 获取自相关 max。
 */
async function fetchSelfCorr(alphaId: string): Promise<string | null> {
  try {
    const res = await brainGet(`/alphas/${alphaId}/correlations/self`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.max != null ? String(data.max) : null;
  } catch {
    return null;
  }
}

/**
 * 全量同步：login → fetch unsubmitted → fetch submitted → fetch user info → upsert DB
 */
export async function syncBrainAlphas(): Promise<{
  ok: boolean;
  unsubmitted: number;
  submitted: number;
  userInfo: boolean;
  error?: string;
  biometrics?: boolean;
  alreadyRunning?: boolean;
}> {
  // 防止并发：已有同步在跑则直接返回
  if (syncInProgress) {
    return {
      ok: false,
      unsubmitted: 0,
      submitted: 0,
      userInfo: false,
      alreadyRunning: true,
      error: '已有同步任务在后台运行',
    };
  }
  syncInProgress = true;
  // 注意：sync route 会立即返回 202，不 await 这里
  // 所以锁在整个后台任务期间由 syncInProgress=true 保持
  syncBrainAlphasInternal().finally(() => {
    syncInProgress = false;
  });
  // 返回一个已解决的 Promise，不暴露给调用方 await
  return {
    ok: true,
    unsubmitted: 0,
    submitted: 0,
    userInfo: false,
  };
}

async function syncBrainAlphasInternal(): Promise<void> {
  initDb();

  // 1. 登录（返回 user.id）
  const login = await loginBrain();
  if (!login.ok) {
    console.error('[brain/sync internal] login failed:', login.error);
    return;
  }

  // 2. 拉 unsubmitted + submitted
  const unsubmittedAlphas = await fetchAlphasByStatus('UNSUBMITTED');
  const submittedAlphas = await fetchAlphasByStatus('ACTIVE');

  // 3. upsert 到 brain_alphas
  const now = new Date().toISOString();
  const allAlphas = [...unsubmittedAlphas, ...submittedAlphas];
  for (const a of allAlphas) {
    const is = a.is || {};
    const settings = a.settings || {};
    const checks = is.checks || [];

    // self-corr 只在详情页按需拉，此处跳过以避免 85 个额外 API 调用拖慢同步
    // （BRAIN API 限速 5req/min，85 个请求要等 17 分钟）
    let selfCorrMax: string | null = null;

    const row: any = {
      id: a.id,
      status: a.status || '',
      stage: a.stage || '',
      grade: a.grade || '',
      type: a.type || '',
      expression: a.regular?.code || '',
      settingsJson: JSON.stringify(settings),
      sharpe: is.sharpe != null ? String(is.sharpe) : '',
      fitness: is.fitness != null ? String(is.fitness) : '',
      turnover: is.turnover != null ? String(is.turnover) : '',
      returns: is.returns != null ? String(is.returns) : '',
      drawdown: is.drawdown != null ? String(is.drawdown) : '',
      margin: is.margin != null ? String(is.margin) : '',
      pnl: is.pnl != null ? String(is.pnl) : '',
      bookSize: is.bookSize != null ? String(is.bookSize) : '',
      longCount: is.longCount || 0,
      shortCount: is.shortCount || 0,
      startDate: is.startDate || '',
      checksJson: JSON.stringify(checks),
      dateSubmitted: a.dateSubmitted || null,
      selfCorrMax,
      rawJson: JSON.stringify(a),
      syncedAt: now,
      updatedAt: now,
    };

    // upsert (SQLite ON CONFLICT)
    try {
      db.insert(brainAlphas)
        .values(row)
        .onConflictDoUpdate({
          target: brainAlphas.id,
          set: { ...row, createdAt: undefined },
        })
        .run();
    } catch (err: any) {
      console.error(`[brain/sync] upsert error for id=${a.id}:`, err.message);
    }
  }

  // 4. 保存 user info（来自登录响应 /users/me 备用）
  let userInfoSynced = false;
  const brainEmail = process.env.BRAIN_CREDENTIAL_EMAIL || '';
  const userIdFromLogin = login.user?.id || '';
  if (userIdFromLogin || brainEmail) {
    db.delete(brainUserInfo).run();
    db.insert(brainUserInfo)
      .values({
        userId: userIdFromLogin,
        email: brainEmail,
        displayName: userIdFromLogin || brainEmail,
        rawJson: JSON.stringify({ id: userIdFromLogin, source: 'login' }),
        lastSyncAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    userInfoSynced = true;
  }

  console.log(`[brain/sync internal] done: unsubmitted=${unsubmittedAlphas.length} submitted=${submittedAlphas.length}`);
}

/**
 * 返回 BRAIN 集成状态（不调远程 API，只读本地 DB）。
 */
export function getBrainStatus() {
  initDb();
  const rawSqlite: any = sqlite;
  const unsubmittedCount = (
    rawSqlite
      .prepare("SELECT COUNT(*) as c FROM brain_alphas WHERE status='UNSUBMITTED'")
      .get() as any
  ).c;
  const submittedCount = (
    rawSqlite
      .prepare("SELECT COUNT(*) as c FROM brain_alphas WHERE status='ACTIVE'")
      .get() as any
  ).c;
  // lastSyncAt: 优先用 brain_user_info.last_sync_at，否则 fallback 到 brain_alphas.max(synced_at)
  const userInfo = rawSqlite
    .prepare(
      'SELECT user_id, email, display_name, last_sync_at FROM brain_user_info LIMIT 1'
    )
    .get() as any;
  let lastSyncAt = userInfo?.last_sync_at || null;
  if (!lastSyncAt) {
    const row = rawSqlite
      .prepare('SELECT max(synced_at) as m FROM brain_alphas')
      .get() as any;
    lastSyncAt = row?.m || null;
  }

  return {
    // 有 userInfo 数据说明同步已成功配置过（env 凭证可能有也可能已更新）
    configured: !!userInfo,
    credentialsSet: isBrainConfigured(),
    lastSyncAt,
    unsubmittedCount,
    submittedCount,
    userInfo: userInfo || null,
  };
}

/**
 * 查询 alpha 列表。
 */
export function listAlphas(opts: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  initDb();
  const rawSqlite: any = sqlite;
  const status = opts.status || '';
  const limit = Math.min(opts.limit || 100, 200);
  const offset = opts.offset || 0;

  let sql =
    'SELECT id, status, stage, grade, type, expression, sharpe, fitness, turnover, returns, drawdown, margin, pnl, book_size, long_count, short_count, start_date, checks_json, date_submitted, self_corr_max, synced_at FROM brain_alphas';
  const params: any[] = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY synced_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return rawSqlite.prepare(sql).all(...params) as any[];
}

/**
 * 查询单个 alpha 详情（从本地 DB）。
 */
export function getAlphaFromDb(alphaId: string) {
  initDb();
  const rawSqlite: any = sqlite;
  return rawSqlite.prepare('SELECT * FROM brain_alphas WHERE id = ?').get(
    alphaId
  ) as any;
}
