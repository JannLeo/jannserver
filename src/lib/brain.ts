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

    if (res.status === 201) {
      cookieStr = parseSetCookie(res.headers);
      sessionExpiry = Date.now() + 3600 * 1000; // 先设 1h，ensureSession 会精确化
      return { ok: true };
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
    return { ok: false, error: `登录失败: HTTP ${res.status}` };
  } catch (err: any) {
    clearTimeout(timeout);
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
 * BRAIN GET 请求，带 cookie + Retry-After 处理。最多重试 3 次。
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

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
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
 */
async function fetchAlphasByStatus(
  status: 'UNSUBMITTED' | 'ACTIVE'
): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const order = status === 'UNSUBMITTED' ? '-is.sharpe' : '-dateSubmitted';
  const extra = status === 'UNSUBMITTED' ? '&hidden=false&type!=SUPER' : '';

  while (true) {
    const path = `/users/self/alphas?limit=100&offset=${offset}&status=${status}&order=${order}${extra}`;
    const res = await brainGet(path);
    if (!res.ok) {
      throw new Error(
        `fetchAlphas ${status} HTTP ${res.status}: ${await res.text().catch(() => '')}`
      );
    }
    const data = await res.json();
    const results = data?.results || [];
    all.push(...results);
    if (results.length < 100) break;
    offset += 100;
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
}> {
  initDb();

  // 1. 登录
  const login = await loginBrain();
  if (!login.ok) {
    return {
      ok: false,
      unsubmitted: 0,
      submitted: 0,
      userInfo: false,
      error: login.error,
      biometrics: login.biometrics,
    };
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

    // 对未提交 alpha 拉 self-corr（已提交的不需要）
    let selfCorrMax: string | null = null;
    if (a.status === 'UNSUBMITTED') {
      selfCorrMax = await fetchSelfCorr(a.id);
    }

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
    db.insert(brainAlphas)
      .values(row)
      .onConflictDoUpdate({
        target: brainAlphas.id,
        set: { ...row, createdAt: undefined },
      })
      .run();
  }

  // 4. 拉 user info
  let userInfoSynced = false;
  try {
    const userRes = await brainGet('/users/me');
    if (userRes.ok) {
      const userData = await userRes.json();
      // 单行覆盖：先删后插
      db.delete(brainUserInfo).run();
      db.insert(brainUserInfo)
        .values({
          userId: userData.id || '',
          email: userData.email || '',
          displayName: userData.displayName || userData.email || '',
          rawJson: JSON.stringify(userData),
          lastSyncAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      userInfoSynced = true;
    }
  } catch (err) {
    console.error('[brain] fetch user info failed:', err);
  }

  return {
    ok: true,
    unsubmitted: unsubmittedAlphas.length,
    submitted: submittedAlphas.length,
    userInfo: userInfoSynced,
  };
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
  const userInfo = rawSqlite
    .prepare(
      'SELECT user_id, email, display_name, last_sync_at FROM brain_user_info LIMIT 1'
    )
    .get() as any;
  const lastSyncAt = userInfo?.last_sync_at || null;

  return {
    configured: isBrainConfigured(),
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
