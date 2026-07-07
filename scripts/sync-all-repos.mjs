/**
 * sync-all-repos.mjs
 * 同步 JannLeo 所有 GitHub 仓库（直接从 GitHub API 获取列表，SSH git clone）
 * Run: node scripts/sync-all-repos.mjs
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import Database from 'better-sqlite3';

const REPOS_BASE_DIR = '/home/sz/workspace/data/repos';
const DB_PATH = '/home/sz/workspace/data/app.db';
const GITHUB_USER = 'JannLeo';

// 已有的不重复同步（只跳过明确不需要自动同步的仓库）
// worldquant / aitoearn 从 ALREADY 移除：它们需要被克隆到本地
const ALREADY = new Set(['summary-for-work', 'teach']);

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

function repoExists(name) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM repo_sources WHERE name = ?').get(name);
  db.close();
  return row ? row.id : null;
}

function insertRepo(name, url, branch) {
  const localPath = path.join(REPOS_BASE_DIR, name);
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO repo_sources (name, url, branch, local_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(name, url, branch || 'main', localPath, now, now);
  const row = db.prepare('SELECT id FROM repo_sources WHERE name = ?').get(name);
  db.close();
  return row.id;
}

function updateSyncTime(id) {
  const db = getDb();
  db.prepare('UPDATE repo_sources SET last_sync_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
  db.close();
}

function countDocs(repoId) {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM repo_documents WHERE repo_id = ?').get(repoId);
  db.close();
  return row.cnt;
}

function execGit(...args) {
  try {
    const stdout = execSync('git ' + args.join(' '), {
      cwd: REPOS_BASE_DIR,
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: stdout.toString() };
  } catch (e) {
    const stderr = e.stderr?.toString() || '';
    const msg = stderr || e.message || '';
    return { ok: false, out: msg };
  }
}

const SKIP_DIRS = new Set(['.git','node_modules','.next','.cache','dist','build','venv','.venv','site-packages']);

function scanMarkdown(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) scanMarkdown(full, files);
    else if (e.name.endsWith('.md') || e.name.endsWith('.MD')) files.push(full);
  }
  return files;
}

function extractTitle(content, relPath) {
  const h1 = content.match(/^#\s+(.+)/m);
  if (h1) return h1[1].trim();
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (fm) {
    const line = fm[1].split('\n').find(l => l.trimStart().startsWith('title:'));
    if (line) return line.split('title:')[1].trim().replace(/^["']|["']$/g, '').trim();
  }
  const fn = (relPath.split('/').pop() || '').replace(/\.[^.]+$/, '').replace(/[-_.]+/g, ' ').trim();
  return fn || '无标题';
}

function stripFrontmatter(c) { return c.replace(/^---[\s\S]*?---\n?/, ''); }

function computeHash(c) { return crypto.createHash('sha256').update(c, 'utf8').digest('hex'); }

function upsertDoc(repoId, filePath, title, relPath, content, hash) {
  const db = getDb();
  const existing = db.prepare('SELECT id, content_hash FROM repo_documents WHERE repo_id = ? AND file_path = ?')
    .get(repoId, filePath);
  const now = new Date().toISOString();
  if (existing) {
    if (existing.content_hash !== hash) {
      db.prepare('UPDATE repo_documents SET title=?, rel_path=?, content_hash=?, content=?, updated_at=? WHERE id=?')
        .run(title, relPath, hash, content, now, existing.id);
    }
  } else {
    db.prepare('INSERT INTO repo_documents (repo_id, file_path, title, rel_path, content_hash, content, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(repoId, filePath, title, relPath, hash, content, now);
  }
  db.close();
}

async function fetchGithubRepos() {
  const res = await fetch(
    `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`,
    { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'workspace-sync-bot' } }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const repos = await res.json();
  return repos.filter(r => !r.fork);
}

async function syncRepoData(repoId, localPath, name) {
  const mdFiles = scanMarkdown(localPath);
  console.log(`  → ${mdFiles.length} .md files`);
  let added = 0, updated = 0;
  for (const f of mdFiles) {
    try {
      const raw = fs.readFileSync(f, 'utf8');
      const rel = path.relative(localPath, f);
      const title = extractTitle(raw, rel);
      const clean = stripFrontmatter(raw);
      const hash = computeHash(clean);
      const db = getDb();
      const existing = db.prepare('SELECT content_hash FROM repo_documents WHERE repo_id = ? AND file_path = ?')
        .get(repoId, f);
      db.close();
      if (!existing || existing.content_hash !== hash) {
        upsertDoc(repoId, f, title, rel, clean, hash);
        if (existing) updated++; else added++;
      }
    } catch (_) {}
  }
  console.log(`  ✓ ${name}: ${added} added, ${updated} updated, total ${countDocs(repoId)}`);
}

async function main() {
  fs.mkdirSync(REPOS_BASE_DIR, { recursive: true });

  console.log('Fetching GitHub repos...');
  const repos = await fetchGithubRepos();
  const newRepos = repos.filter(r => !ALREADY.has(r.name));
  console.log(`Found ${repos.length} repos, ${newRepos.length} new to sync`);

  // 1. Register new repos in DB
  for (const r of newRepos) {
    const url = r.clone_url;
    const branch = r.default_branch || 'main';
    const existingId = repoExists(r.name);
    if (existingId) {
      console.log(`[SKIP] ${r.name} already registered (id=${existingId})`);
    } else {
      const id = insertRepo(r.name, url, branch);
      console.log(`[REGISTER] ${r.name} → id=${id}`);
    }
  }

  // 2. Clone and index each new repo
  for (const r of newRepos) {
    const localPath = path.join(REPOS_BASE_DIR, r.name);
    const repoId = repoExists(r.name);
    if (!repoId) { console.log(`[ERROR] ${r.name} not in DB`); continue; }

    const branch = r.default_branch || 'main';
    const httpsUrl = `https://github.com/${GITHUB_USER}/${r.name}.git`;

    // If clone fails with given branch, try other common branch names
    async function tryClone(repoName, branchToTry, url, dest) {
      const result = execGit('clone', '--branch', branchToTry, '--depth', '1', url, dest);
      return result;
    }

    if (!fs.existsSync(localPath) || !fs.readdirSync(localPath).filter(f => f !== '.git').length) {
      // Clone via HTTPS (public repo, no auth)
      console.log(`[CLONE] ${r.name} (${branch})...`);
      let cloned = false;
      const branchesToTry = [branch, 'main', 'master', 'develop'].filter((v, i, a) => a.indexOf(v) === i);
      for (const b of branchesToTry) {
        const result = await tryClone(r.name, b, httpsUrl, localPath);
        if (result.ok) {
          console.log(`  ✓ Cloned (branch: ${b})`);
          cloned = true;
          break;
        }
      }
      if (!cloned) {
        console.log(`  ⚠ Clone failed for all branches, will retry on next sync`);
      }
    } else {
      // Pull
      console.log(`[PULL] ${r.name}...`);
      const result = execGit('-C', localPath, 'pull', 'origin', branch);
      if (!result.ok) {
        console.log(`  ⚠ Pull failed: ${result.out.slice(0, 100)}, continuing anyway`);
      }
    }

    await syncRepoData(repoId, localPath, r.name);
    updateSyncTime(repoId);
  }

  console.log('\n✅ All repos synced!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });