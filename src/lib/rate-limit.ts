// Rate limiting using raw SQLite — does NOT import db/index (no better-sqlite3)
// This can be used from middleware (Edge compatible, no Node.js fs)
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let _sqlite: Database.Database | null = null;

function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite;
  const dbPath = path.resolve(process.env.DB_PATH || "./data/app.db");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) return _sqlite = null as any;
  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  return _sqlite;
}

export async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
  const max = 5;
  const sqlite = getSqlite();
  if (!sqlite) return { allowed: true, remaining: max };
  try {
    sqlite.exec(`DELETE FROM login_failures WHERE attempt_at < datetime('now', '-15 minutes')`);
    const result = sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM login_failures WHERE username = ? AND attempt_at > datetime('now', '-15 minutes')`
    ).get(key) as { cnt: number } | undefined;
    const count = result?.cnt ?? 0;
    return { allowed: count < max, remaining: Math.max(0, max - count) };
  } catch {
    return { allowed: true, remaining: max };
  }
}

export async function recordFailure(key: string): Promise<void> {
  const sqlite = getSqlite();
  if (!sqlite) return;
  try {
    sqlite.prepare(`INSERT INTO login_failures (username, attempt_at) VALUES (?, datetime('now'))`).run(key);
  } catch { /* ignore */ }
}