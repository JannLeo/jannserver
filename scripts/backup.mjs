#!/usr/bin/env node
/**
 * backup.mjs — Personal Workspace 数据备份脚本
 * 
 * 使用 better-sqlite3 backup() API 创建一致的 SQLite 快照，
 * 配合 tar 打包 data 目录（app.db + memos + notes + daily + uploads）
 * 
 * 输出: /data/backups/workspace_YYYY-MM-DD_HHMMSS.tar.gz
 * 
 * 用法:
 *   node scripts/backup.mjs
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '..', 'data');
const BACKUP_DIR = join(DATA_DIR, 'backups');
const DB_PATH    = join(DATA_DIR, 'app.db');
const TIMESTAMP  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTPUT     = join(BACKUP_DIR, `workspace_${TIMESTAMP}.tar.gz`);

// ── 验证 ──────────────────────────────────────────────
if (!existsSync(DB_PATH)) {
  console.error('ERROR: app.db not found at', DB_PATH);
  process.exit(1);
}
if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

// ── SQLite WAL checkpoint + 快照 ─────────────────────
let useSnapshot = false;
try {
  const Database = (await import('better-sqlite3')).default;
  const db = Database(DB_PATH, { readonly: true });

  // WAL checkpoint — 刷入所有未提交的 WAL 内容
  db.pragma('wal_checkpoint(TRUNCATE)');

  // 使用 backup() API 导出一致的快照到临时文件
  const SNAPSHOT_PATH = join(BACKUP_DIR, `snapshot_${TIMESTAMP}.db`);
  const backup = db.backup(SNAPSHOT_PATH);
  await new Promise((res, rej) => {
    backup.step(-1);
    backup.finish().then(res).catch(rej);
  });
  db.close();
  useSnapshot = true;
  console.log(`✓ SQLite snapshot: ${SNAPSHOT_PATH}`);
} catch (err) {
  console.error('⚠ WAL checkpoint 失败，使用实时 db 文件:', err.message);
}

// ── 打包 data 目录（排除 backups 自身） ─────────────
const items = readdirSync(DATA_DIR).filter(n => n !== 'backups');
const itemArgs = items.map(n => `"${n}"`).join(' ');
const cmd = `tar czf "${OUTPUT}" -C "${DATA_DIR}" ${itemArgs}`;
console.log('→', cmd);

try {
  execSync(cmd, { cwd: DATA_DIR, stdio: 'pipe' });
  const size = statSync(OUTPUT).size;
  const sizeMB = (size / 1024 / 1024).toFixed(2);
  console.log(`✓ 备份完成: ${OUTPUT} (${sizeMB} MB)`);
  console.log(`BACKUP_FILE=${OUTPUT}`);
  console.log(`BACKUP_SIZE=${size}`);
} catch (e) {
  console.error('ERROR: tar 打包失败:', e.message);
  process.exit(1);
}

// ── 清理临时 snapshot 文件 ──────────────────────────
if (useSnapshot) {
  const snapshot = join(BACKUP_DIR, `snapshot_${TIMESTAMP}.db`);
  try { execSync(`rm -f "${snapshot}"`); } catch (_) {}
}