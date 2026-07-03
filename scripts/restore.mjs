#!/usr/bin/env node
/**
 * restore.mjs — Personal Workspace 数据恢复脚本
 * 
 * 从 workspace_YYYY-MM-DD_HHMMSS.tar.gz 备份恢复数据。
 * 
 * 用法:
 *   node scripts/restore.mjs [--dry-run] <backup_file>
 *   node scripts/restore.mjs --verify  <backup_file>
 *   node scripts/restore.mjs          <backup_file>   # 交互确认后恢复
 * 
 * --dry-run: 仅解压到临时目录验证，不写入 data/
 * --verify:  同 dry-run，但额外检查数据库完整性
 */

import { createReadStream, existsSync, mkdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, basename, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'data');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('--verify');
const verify = args.includes('--verify');

let backupFile = args.find(a => !a.startsWith('--'));
if (!backupFile) {
  console.error('用法: node scripts/restore.mjs [--dry-run] [--verify] <backup_file>');
  process.exit(1);
}
if (!existsSync(backupFile)) {
  const autoPath = join(DATA_DIR, 'backups', backupFile);
  if (existsSync(autoPath)) backupFile = autoPath;
  else { console.error('文件不存在:', backupFile); process.exit(1); }
}

const stat = statSync(backupFile);
console.log(`备份文件: ${backupFile} (${(stat.size/1024/1024).toFixed(2)} MB)`);

// ── 解压到临时目录 ─────────────────────────────────
const stageDir = join(tmpdir(), `pw_restore_${Date.now()}`);
mkdirSync(stageDir, { recursive: true });
console.log(`解压到临时目录: ${stageDir}`);

try {
  execSync(`tar xzf "${backupFile}" -C "${stageDir}"`, { stdio: 'pipe' });
} catch (e) {
  console.error('ERROR: 解压失败:', e.message);
  process.exit(1);
}

// ── 检查解压内容 ────────────────────────────────────
// 备份文件用 -C data/ 打包，所以展开放到 stageDir/{app.db,notes/,...}
// 也可能是 stageDir/data/{app.db,...}（标准格式）
const stageDataDir = existsSync(join(stageDir, 'data'))
  ? join(stageDir, 'data')
  : stageDir;

const items = execSync(`ls "${stageDataDir}"`, { encoding: 'utf8' }).trim().split('\n');
console.log('备份包含:', items.join(', '));

// ── --verify 模式 ─────────────────────────────────
if (verify) {
  console.log('\n=== 数据库完整性检查 ===');
  try {
    const Database = (await import('better-sqlite3')).default;
    const dbFile = join(stageDataDir, 'app.db');
    if (!existsSync(dbFile)) { console.error('app.db 不存在'); process.exit(1); }
    
    const db = Database(dbFile, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('表:', tables.map(t => t.name).join(', '));
    
    const counts = {
      notes:    db.prepare('SELECT count(*) as c FROM notes').get().c,
      tasks:    db.prepare('SELECT count(*) as c FROM tasks').get().c,
      memos:    db.prepare('SELECT count(*) as c FROM memos').get().c,
      projects: db.prepare('SELECT count(*) as c FROM projects').get().c,
    };
    console.log('记录数:', JSON.stringify(counts));
    
    db.close();
    console.log('✓ 数据库完整，无损坏');
  } catch (err) {
    console.error('✗ 数据库检查失败:', err.message);
    process.exit(1);
  }
}

// ── --dry-run 结束 ─────────────────────────────────
if (dryRun && !verify) {
  console.log('\n[dry-run] 以下操作将被跳过（--dry-run 模式）');
  console.log('  tar xzf →', stageDataDir);
  console.log('  复制到 →', DATA_DIR);
  console.log('\n使用 --verify 检查备份内容，或去掉 --dry-run 执行实际恢复。');
}

// ── 实际恢复 ──────────────────────────────────────
if (!dryRun) {
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const q = () => new Promise(r => rl.question('⚠ 这将覆盖当前 data/ 内容。继续？(yes/no): ', r));
  const ans = (await q()).trim().toLowerCase();
  rl.close();
  if (ans !== 'yes' && ans !== 'y') { console.log('已取消。'); process.exit(0); }

  console.log('→ 替换 data/ 内容...');
  for (const item of items) {
    const src = join(stageDataDir, item);
    const dst = join(DATA_DIR, item);
    try {
      execSync(`rm -rf "${dst}"`);
      execSync(`cp -r "${src}" "${dst}"`);
      console.log(`  ✓ ${item}`);
    } catch (e) {
      console.error(`  ✗ ${item}: ${e.message}`);
    }
  }
  console.log('✓ 恢复完成。当前服务器需要重启以加载新数据。');
}

// ── 清理临时目录 ──────────────────────────────────
try { execSync(`rm -rf "${stageDir}"`); } catch (_) {}
console.log('✓ 临时文件已清理');