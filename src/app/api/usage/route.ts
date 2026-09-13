import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';

export const runtime = 'nodejs';

const NEW_API_DB = '/home/sz/new-api-data/one-api.db';
const QUOTA_PER_UNIT = 500000;
const EXCHANGE_RATE = 7.3;

function qty(quota: number): number {
  return parseFloat(((quota / QUOTA_PER_UNIT) * EXCHANGE_RATE).toFixed(4));
}

export async function GET() {
  if (!fs.existsSync(NEW_API_DB)) {
    return NextResponse.json({
      ok: true, balance: null, usedToday: null,
      used7d: null, used30d: null, requestCountToday: null, tokenCountToday: null,
    });
  }

  try {
    const out = execSync('python3', {
      input: `
import sqlite3, json, datetime
db = sqlite3.connect('${NEW_API_DB}')
cur = db.cursor()
now = datetime.datetime.now()
QUOTA_PER_UNIT = ${QUOTA_PER_UNIT}
EXCHANGE_RATE = ${EXCHANGE_RATE}
today_start = int(datetime.datetime(now.year, now.month, now.day).timestamp())
d7_start = int((now - datetime.timedelta(days=7)).timestamp())
d30_start = int((now - datetime.timedelta(days=30)).timestamp())
def q(q): return round((q / QUOTA_PER_UNIT) * EXCHANGE_RATE, 4)
# balance
cur.execute('SELECT quota FROM users WHERE id=1')
balance = q(cur.fetchone()[0] or 0)
# today
cur.execute('SELECT COALESCE(SUM(quota),0),COUNT(*),COALESCE(SUM(prompt_tokens+completion_tokens),0) FROM logs WHERE user_id=1 AND created_at >= ?', (today_start,))
t = cur.fetchone()
today_cost = q(t[0]); today_req = t[1]; today_tok = t[2]
# 7d
cur.execute('SELECT COALESCE(SUM(quota),0) FROM logs WHERE user_id=1 AND created_at >= ?', (d7_start,))
cost7d = q(cur.fetchone()[0])
# 30d
cur.execute('SELECT COALESCE(SUM(quota),0) FROM logs WHERE user_id=1 AND created_at >= ?', (d30_start,))
cost30d = q(cur.fetchone()[0])
db.close()
print(json.dumps({"balance":balance,"today_cost":today_cost,"today_req":today_req,"today_tok":today_tok,"cost7d":cost7d,"cost30d":cost30d}))
`,
      timeout: 10000,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    });

    const data = JSON.parse(out.trim());
    return NextResponse.json({
      ok: true,
      balance: data.balance,
      usedToday: data.today_cost,
      used7d: data.cost7d,
      used30d: data.cost30d,
      requestCountToday: data.today_req,
      tokenCountToday: data.today_tok,
    });
  } catch {
    return NextResponse.json({
      ok: true, balance: null, usedToday: null,
      used7d: null, used30d: null, requestCountToday: null, tokenCountToday: null,
    });
  }
}