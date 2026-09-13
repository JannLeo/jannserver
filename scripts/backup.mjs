#!/usr/bin/env node
/**
 * Create a consistent backup of jannserver data.
 *
 * - Uses better-sqlite3's online backup API for every root-level SQLite DB.
 * - Never archives live WAL/SHM files.
 * - Copies non-database data into an isolated staging directory.
 * - Avoids shell string construction for tar invocation.
 */

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const configuredDbPath = resolve(process.env.DB_PATH || join(projectDir, 'data', 'app.db'));
const DATA_DIR = resolve(process.env.DATA_DIR || dirname(configuredDbPath));
const BACKUP_DIR = resolve(process.env.BACKUP_DIR || join(DATA_DIR, 'backups'));
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTPUT = join(BACKUP_DIR, `workspace_${TIMESTAMP}.tar.gz`);
const DB_RE = /\.(?:db|sqlite|sqlite3)$/i;
const DB_SIDECAR_RE = /\.(?:db|sqlite|sqlite3)-(?:wal|shm|journal)$/i;

if (!existsSync(configuredDbPath)) {
  console.error('ERROR: database not found at', configuredDbPath);
  process.exit(1);
}
mkdirSync(BACKUP_DIR, { recursive: true });

const stageDir = mkdtempSync(join(tmpdir(), 'jannserver-backup-'));
const snappedDatabases = [];

function runTar(args) {
  const result = spawnSync('tar', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tar exited with status ${result.status}`);
}

function ensureSafeSource(source, name) {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    console.warn(`⚠ 跳过符号链接: ${name}`);
    return false;
  }
  return true;
}

async function snapshotDatabase(Database, source, destination) {
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }

  const snapshot = new Database(destination, { readonly: true, fileMustExist: true });
  try {
    const check = snapshot.pragma('quick_check', { simple: true });
    if (check !== 'ok') throw new Error(`SQLite quick_check failed for ${basename(source)}: ${check}`);
  } finally {
    snapshot.close();
  }
}

try {
  const Database = (await import('better-sqlite3')).default;
  const entries = readdirSync(DATA_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'backups') continue;

    const source = join(DATA_DIR, entry.name);
    const destination = join(stageDir, entry.name);
    if (!ensureSafeSource(source, entry.name)) continue;

    if (entry.isFile() && DB_RE.test(entry.name)) {
      console.log(`→ SQLite snapshot: ${entry.name}`);
      await snapshotDatabase(Database, source, destination);
      snappedDatabases.push(entry.name);
      continue;
    }

    if (entry.isFile() && DB_SIDECAR_RE.test(entry.name)) {
      continue;
    }

    cpSync(source, destination, {
      recursive: entry.isDirectory(),
      force: true,
      dereference: false,
      errorOnExist: false,
    });
  }

  if (!snappedDatabases.includes(basename(configuredDbPath))) {
    const destination = join(stageDir, basename(configuredDbPath));
    console.log(`→ SQLite snapshot: ${basename(configuredDbPath)}`);
    await snapshotDatabase(Database, configuredDbPath, destination);
    snappedDatabases.push(basename(configuredDbPath));
  }

  writeFileSync(
    join(stageDir, 'backup-manifest.json'),
    JSON.stringify(
      {
        format: 2,
        createdAt: new Date().toISOString(),
        databases: snappedDatabases.sort(),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  runTar(['-czf', OUTPUT, '-C', stageDir, '.']);

  const size = statSync(OUTPUT).size;
  console.log(`✓ 备份完成: ${OUTPUT} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`✓ SQLite 快照: ${snappedDatabases.join(', ')}`);
  console.log(`BACKUP_FILE=${OUTPUT}`);
  console.log(`BACKUP_SIZE=${size}`);
} catch (error) {
  console.error('ERROR: 备份失败:', error instanceof Error ? error.message : String(error));
  try { rmSync(OUTPUT, { force: true }); } catch {}
  process.exitCode = 1;
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
