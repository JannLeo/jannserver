// @ts-nocheck
/**
 * new-api 使用情况统计 — 直接读取 SQLite 数据库
 *
 * new-api 数据库位于 /home/sz/new-api-data/one-api.db
 * 通过直接读 DB 绕过 HTTP API 鉴权问题
 *
 * 转换公式（基于 new-api 配置）：
 *   1 USD = 500000 quota（默认）
 *   1 USD = 7.3 CNY（固定汇率）
 *   所以：CNY = quota / 500000 * 7.3
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
 */
export function getNewApiBaseUrl(): string {
  const explicit = (process.env.NEW_API_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  if (aiBaseUrl) {
    return aiBaseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  }
  return 'http://127.0.0.1:12345';
}

const NEW_API_DB = '/home/sz/new-api-data/one-api.db';
const QUOTA_PER_UNIT = 500000;
const EXCHANGE_RATE = 7.3;

function qty(quota: number): number {
  if (!quota || quota <= 0) return 0;
  return parseFloat(((quota / QUOTA_PER_UNIT) * EXCHANGE_RATE).toFixed(4));
}

/**
 * 通过直接读取 new-api SQLite 数据库获取使用情况统计
 * 绕过 HTTP API 鉴权问题
 */
export function getNewApiUsage(range: 'today' | '7d' | '30d' = '7d'): NewApiUsageResult {
  const fs = require('fs');
  if (!fs.existsSync(NEW_API_DB)) {
    return {
      configured: false,
      source: 'none',
      baseUrl: getNewApiBaseUrl(),
      summary: null,
      daily: [],
      byModel: [],
      byChannel: [],
      recentLogs: [],
      error: 'new-api 数据库文件不存在',
    };
  }

  const rangeArg = range === 'today' ? 1 : range === '7d' ? 7 : 30;
  const pythonScript = `
import sqlite3, json, datetime

RANGE = ${rangeArg}
QUOTA_PER_UNIT = 500000
EXCHANGE_RATE = 7.3

db = sqlite3.connect('/home/sz/new-api-data/one-api.db')
cur = db.cursor()

# 获取用户信息
cur.execute('SELECT quota, used_quota, request_count FROM users WHERE id=1')
u = cur.fetchone()
quota = u[0] if u else 0
used_quota = u[1] if u else 0
request_count = u[2] if u else 0

def fmt(n):
    if n >= 1_000_000_000:
        return f"¥{n/1_000_000_000:.2f}亿"
    elif n >= 1_000_000:
        return f"¥{n/1_000_000:.2f}万"
    elif n >= 1_000:
        return f"¥{n/1_000:.2f}K"
    else:
        return f"¥{n:.2f}"

def qty(q):
    return round((q / QUOTA_PER_UNIT) * EXCHANGE_RATE, 4)

range_days = {'today': 1, '7d': 7, '30d': 30}.get(RANGE, 7)

# 时间范围
now = datetime.datetime.now()
today_start = int(datetime.datetime(now.year, now.month, now.day).timestamp())
d_start = int((now - datetime.timedelta(days=range_days)).timestamp())
d30_start = int((now - datetime.timedelta(days=30)).timestamp())

# 今日统计（永远从今天0点）
cur.execute("""
    SELECT COALESCE(SUM(quota),0), COUNT(*), COALESCE(SUM(prompt_tokens + completion_tokens),0)
    FROM logs WHERE user_id=1 AND created_at >= ?
""", (today_start,))
today_cost, today_req, today_tok = cur.fetchone()

# 7 日统计
cur.execute("""
    SELECT COALESCE(SUM(quota),0)
    FROM logs WHERE user_id=1 AND created_at >= ?
""", (d_start,))
cost7d = cur.fetchone()[0]

# 30 日统计
cur.execute("""
    SELECT COALESCE(SUM(quota),0)
    FROM logs WHERE user_id=1 AND created_at >= ?
""", (d30_start,))
cost30d = cur.fetchone()[0]

# 选中的 range 期间的消耗（用于 byModel/byChannel/daily）
cur.execute("""
    SELECT COALESCE(SUM(quota),0), COUNT(*), COALESCE(SUM(prompt_tokens + completion_tokens),0)
    FROM logs WHERE user_id=1 AND created_at >= ?
""", (d_start,))
range_cost, range_req, range_tok = cur.fetchone()

# 每日统计（按 range 筛选）
cur.execute("""
    SELECT (created_at / 86400) * 86400, COALESCE(SUM(quota),0), COUNT(*), COALESCE(SUM(prompt_tokens + completion_tokens),0)
    FROM logs WHERE user_id=1 AND created_at >= ?
    GROUP BY created_at / 86400 ORDER BY created_at / 86400 DESC LIMIT 30
""", (d_start,))
daily_rows = []
for row in cur.fetchall():
    day = datetime.datetime.fromtimestamp(row[0]).strftime('%Y-%m-%d')
    daily_rows.append({"date": day, "cost": qty(row[1]), "requests": row[2], "tokens": row[3]})

# 按模型统计（按 range 筛选）
cur.execute("""
    SELECT model_name, COALESCE(SUM(quota),0), COUNT(*), COALESCE(SUM(prompt_tokens + completion_tokens),0)
    FROM logs WHERE user_id=1 AND created_at >= ?
    GROUP BY model_name ORDER BY SUM(quota) DESC LIMIT 15
""", (d_start,))
model_rows = []
for row in cur.fetchall():
    model_rows.append({"model": row[0], "cost": qty(row[1]), "requests": row[2], "tokens": row[3]})

# 按渠道统计（按 range 筛选，JOIN channels 获取名称）
cur.execute("""
    SELECT COALESCE(c.name, '新API直连'), COALESCE(SUM(l.quota),0), COUNT(*), COALESCE(SUM(l.prompt_tokens + l.completion_tokens),0)
    FROM logs l LEFT JOIN channels c ON l.channel_id = c.id
    WHERE l.user_id=1 AND l.created_at >= ?
    GROUP BY l.channel_id ORDER BY SUM(l.quota) DESC LIMIT 15
""", (d_start,))
channel_rows = []
for row in cur.fetchall():
    channel_rows.append({"channel": row[0] or '新API直连', "cost": qty(row[1]), "requests": row[2], "tokens": row[3]})

# 最近调用记录
cur.execute("""
    SELECT created_at, model_name, prompt_tokens, completion_tokens, quota
    FROM logs WHERE user_id=1 ORDER BY id DESC LIMIT 20
""")
recent = []
for row in cur.fetchall():
    dt = datetime.datetime.fromtimestamp(row[0])
    time_str = dt.strftime('%Y-%m-%d %H:%M:%S')
    total_tok = (row[2] or 0) + (row[3] or 0)
    recent.append({
        "time": time_str,
        "model": row[1] or '',
        "promptTokens": row[2] or 0,
        "completionTokens": row[3] or 0,
        "totalTokens": total_tok,
        "cost": qty(row[4] or 0),
        "status": "success",
    })

db.close()

result = {
    "quota": quota,
    "used_quota": used_quota,
    "request_count": request_count,
    "today_cost": qty(today_cost),
    "today_req": today_req,
    "today_tok": today_tok,
    "cost7d": qty(cost7d),
    "cost30d": qty(cost30d),
    "balance": qty(quota),
    "daily": daily_rows,
    "byModel": model_rows,
    "byChannel": channel_rows,
    "recentLogs": recent,
}
print(json.dumps(result, ensure_ascii=False))
  `;

  try {
    const { execSync } = require('child_process');
    const output = execSync('python3', { input: pythonScript, timeout: 10000, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
    const data = JSON.parse(output.trim());

    return {
      configured: true,
      source: 'direct_db',
      baseUrl: getNewApiBaseUrl(),
      summary: {
        balance: data.balance,
        usedToday: data.today_cost,
        used7d: data.cost7d,
        used30d: data.cost30d,
        requestCountToday: data.today_req,
        tokenCountToday: data.today_tok,
      },
      daily: data.daily,
      byModel: data.byModel,
      byChannel: data.byChannel,
      recentLogs: data.recentLogs,
      error: null,
    };
  } catch (err: any) {
    return {
      configured: true,
      source: 'direct_db',
      baseUrl: getNewApiBaseUrl(),
      summary: null,
      daily: [],
      byModel: [],
      byChannel: [],
      recentLogs: [],
      error: '读取 new-api 数据库失败: ' + (err.message || String(err)),
    };
  }
}
