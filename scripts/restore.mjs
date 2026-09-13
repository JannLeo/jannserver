#!/usr/bin/env node
/**
 * Restore a jannserver backup created by scripts/backup.mjs.
 *
 * Usage:
 *   node scripts/restore.mjs --verify <backup_file>
 *   node scripts/restore.mjs --dry-run <backup_file>
 *   node scripts/restore.mjs [--yes] <backup_file>
 */

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { basename, dirname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const configuredDbPath = resolve(process.env.DB_PATH || join(projectDir, 'data', 'app.db'));
const DATA_DIR = resolve(process.env.DATA_DIR || dirname(configuredDbPath));
const BACKUP_DIR = resolve(process.env.BACKUP_DIR || join(DATA_DIR, 'backups'));
const DB_RE = /\.(?:db|sqlite|sqlite3)$/i;
const DB_SIDECAR_RE = /\.(?:db|sqlite|sqlite3)-(?:wal|shm|journal)$/i;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('--verify');
const verifyOnly = args.includes('--verify');
const assumeYes = args.includes('--yes');
let backupFile = args.find((arg) => !arg.startsWith('--'));

if (!backupFile) {
  console.error('用法: node scripts/restore.mjs [--dry-run|--verify] [--yes] <backup_file>');
  process.exit(1);
}

backupFile = resolve(backupFile);
if (!existsSync(backupFile)) {
  const fallback = join(BACKUP_DIR, basename(backupFile));
  if (existsSync(fallback)) backupFile = fallback;
  else {
    console.error('文件不存在:', backupFile);
    process.exit(1);
  }
}

function runTar(args, options = {}) {
  const result = spawnSync('tar', args, {
    encoding: options.encoding ? 'utf8' : undefined,
    stdio: options.encoding ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = options.encoding ? result.stderr?.trim() : '';
    throw new Error(stderr || `tar exited with status ${result.status}`);
  }
  return options.encoding ? result.stdout : '';
}

function validateArchivePaths(file) {
  const listing = runTar(['-tzf', file], { encoding: true });
  const entries = listing.split('\n').map((item) => item.trim()).filter(Boolean);
  if (entries.length === 0) throw new Error('备份包为空');

  for (const entry of entries) {
    // `tar -C <stage> .` legitimately records the archive root as `./`.
    // It represents no extracted child path, so allow only this exact marker.
    if (entry === '.' || entry === './') continue;

    const cleaned = entry.replace(/^(?:\.\/)+/, '');
    const normalized = normalize(cleaned).replaceAll('\\', '/');
    if (!cleaned || cleaned.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`备份包包含不安全路径: ${entry}`);
    }
  }
  return entries;
}

function rejectSymlinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error(`备份包包含不允许的符号链接: ${full}`);
    if (entry.isDirectory()) rejectSymlinks(full);
  }
}

async function verifyDatabases(stageDataDir) {
  const Database = (await import('better-sqlite3')).default;
  const dbFiles = readdirSync(stageDataDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && DB_RE.test(entry.name))
    .map((entry) => entry.name);

  const appDb = basename(configuredDbPath);
  if (!dbFiles.includes(appDb)) {
    throw new Error(`${appDb} 不存在`);
  }

  for (const dbName of dbFiles) {
    const db = new Database(join(stageDataDir, dbName), { readonly: true, fileMustExist: true });
    try {
      const check = db.pragma('quick_check', { simple: true });
      if (check !== 'ok') throw new Error(`${dbName} quick_check 失败: ${check}`);

      if (dbName === appDb) {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        const names = new Set(tables.map((row) => row.name));
        for (const required of ['users', 'projects', 'notes', 'tasks', 'memos']) {
          if (!names.has(required)) throw new Error(`${dbName} 缺少必需表 ${required}`);
        }
      }
    } finally {
      db.close();
    }
    console.log(`✓ ${dbName}: quick_check ok`);
  }

  return dbFiles;
}

const stat = statSync(backupFile);
console.log(`备份文件: ${backupFile} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

const stageDir = mkdtempSync(join(tmpdir(), 'jannserver-restore-'));
let stageDataDir = stageDir;

try {
  validateArchivePaths(backupFile);
  runTar(['-xzf', backupFile, '-C', stageDir]);
  rejectSymlinks(stageDir);

  if (existsSync(join(stageDir, 'data')) && lstatSync(join(stageDir, 'data')).isDirectory()) {
    stageDataDir = join(stageDir, 'data');
  }

  const manifestPath = join(stageDataDir, 'backup-manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      console.log(`备份格式: ${manifest.format ?? 'unknown'}，创建时间: ${manifest.createdAt ?? 'unknown'}`);
    } catch {
      throw new Error('backup-manifest.json 无效');
    }
  }

  const items = readdirSync(stageDataDir).filter((name) => name !== 'backup-manifest.json');
  console.log('备份包含:', items.join(', '));

  const dbFiles = await verifyDatabases(stageDataDir);

  if (verifyOnly) {
    console.log(`✓ 验证完成，数据库: ${dbFiles.join(', ')}`);
    process.exitCode = 0;
  } else if (dryRun) {
    console.log('\n[dry-run] 备份有效，未修改当前数据。');
    console.log('目标目录:', DATA_DIR);
  } else {
    if (!assumeYes) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise((resolveAnswer) => {
        rl.question('⚠ 这将替换当前 data/ 内容（保留 backups/）。确认应用已停止？(yes/no): ', resolveAnswer);
      });
      rl.close();
      if (!['yes', 'y'].includes(String(answer).trim().toLowerCase())) {
        console.log('已取消。');
        process.exit(0);
      }
    }

    mkdirSync(DATA_DIR, { recursive: true });

    // Remove live data first, but keep the backup archive directory itself.
    for (const entry of readdirSync(DATA_DIR, { withFileTypes: true })) {
      if (entry.name === 'backups') continue;
      rmSync(join(DATA_DIR, entry.name), { recursive: true, force: true });
    }

    for (const item of items) {
      if (DB_SIDECAR_RE.test(item)) continue;
      cpSync(join(stageDataDir, item), join(DATA_DIR, item), {
        recursive: true,
        force: true,
        dereference: false,
      });
      console.log(`  ✓ ${item}`);
    }

    console.log('✓ 恢复完成。请重新启动 jannserver。');
  }
} catch (error) {
  console.error('ERROR:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rmSync(stageDir, { recursive: true, force: true });
  console.log('✓ 临时文件已清理');
}
