// @ts-nocheck
import * as fs from 'fs';
import * as nodePath from 'path';
import * as crypto from 'crypto';
import { execFile as execFileAsync } from 'child_process';
import { spawn } from 'child_process';
import { db } from './db/index';
import { updateFts } from './search';
import { eq, and } from 'drizzle-orm';
import { repoSources, repoDocuments } from './db/schema';
// @ts-ignore - Drizzle sqlite type inference issue with $defaultFn columns
const srcT = repoSources as any;
const docT = repoDocuments as any;

const path = nodePath;

// ─── Constants ────────────────────────────────────────────────────────────────
// For production server: hardcoded absolute path (process.cwd() unreliable in Next.js)
const REPOS_BASE_DIR = '/home/sz/workspace/data/repos';

const ALLOWED_REPOS_PREFIX = 'https://github.com/JannLeo/';

function toSshUrl(httpsUrl: string): string {
  const repo = httpsUrl.replace(/^https:\/\/github\.com\//, '');
  return `git@github.com:${repo}`;
}

// ─── Repo Validation ──────────────────────────────────────────────────────────
export function validateRepoUrl(url: string): boolean {
  if (!url.startsWith(ALLOWED_REPOS_PREFIX)) return false;
  try {
    const u = new URL(url);
    return u.hostname === 'github.com';
  } catch { return false; }
}

export function validateLocalPath(localPath: string): boolean {
  const abs = path.resolve(localPath);
  // Accept paths under workspace or /data/repos/ (broader than just data/repos)
  // This allows /home/sz/summary-for-work, /home/sz/workspace/data/repos/, /data/repos/
  return (
    abs.startsWith('/home/sz/workspace/') ||
    abs.startsWith('/data/repos/')
  ) && !abs.includes('..');
}

// ─── Repo CRUD ─────────────────────────────────────────────────────────────────
export function getAllRepos() {
  return db.select().from(repoSources).all();
}

export function getRepoById(id: number) {
  return db.select().from(repoSources).where(eq(srcT.id, id)).get();
}

export function createRepo(data: { name: string; url: string; branch: string }) {
  const localPath = path.join(REPOS_BASE_DIR, data.name);
  const result = db.insert(repoSources).values({
    name: data.name,
    url: data.url,
    branch: data.branch || 'main',
    localPath,
  }).returning().get();
  return result;
}

export function deleteRepo(id: number) {
  db.delete(repoDocuments).where(eq(docT.repoId, id)).run();
  db.delete(repoSources).where(eq(srcT.id, id)).run();
}

export function getDocumentById(docId: number) {
  return db.select().from(repoDocuments).where(eq(docT.id, docId)).get();
}

export function getDocumentsByRepoId(repoId: number) {
  return db.select().from(repoDocuments).where(eq(docT.repoId, repoId)).all();
}

// ─── Git PTY Helper ─────────────────────────────────────────────────────────
const GIT_ENV = {
  ...process.env,
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
  HTTP_PROXY: '',
  HTTPS_PROXY: '',
  http_proxy: '',
  https_proxy: '',
};

async function gitPty(
  args: string[],
  opts: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const gitCmd = 'git ' + args.join(' ');
  const exitCodeFile = `/tmp/git-exit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const wrappedCmd = `${gitCmd}; echo "GIT_EXIT_CODE=$?" >> "${exitCodeFile}"`;
  const scriptArgs = ['-q', '-c', wrappedCmd, '/dev/null'];

  return new Promise((resolve) => {
    const child = spawn('script', scriptArgs, {
      env: GIT_ENV,
      cwd: opts.cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.stdin.end();

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch (_e) {} }, 3000);
    }, opts.timeout || 120_000);

    child.on('close', () => {
      clearTimeout(timer);
      let exitCode = 128;
      try {
        if (fs.existsSync(exitCodeFile)) {
          const content = fs.readFileSync(exitCodeFile, 'utf8');
          const match = content.match(/GIT_EXIT_CODE=(\d+)/);
          if (match) exitCode = parseInt(match[1], 10);
          fs.unlinkSync(exitCodeFile);
        }
      } catch (_e) {}
      resolve({ stdout, stderr, exitCode });
    });

    child.on('error', () => {
      clearTimeout(timer);
      try { if (fs.existsSync(exitCodeFile)) fs.unlinkSync(exitCodeFile); } catch (_e) {}
      resolve({ stdout, stderr, exitCode: 128 });
    });
  });
}

// ─── Git Clone/Pull ──────────────────────────────────────────────────────────
async function gitCloneOrPull(
  url: string,
  branch: string,
  localPath: string,
  isNew: boolean
): Promise<{ success: boolean; message: string }> {
  const gitUrl = toSshUrl(url);
  try {
    if (isNew) {
      const parentDir = path.dirname(localPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      const result = await gitPty(
        ['clone', '--branch', branch, '--depth', '1', gitUrl, localPath],
        { timeout: 300_000 }
      );
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || result.stdout || 'Clone failed' };
      }
      const files = fs.readdirSync(localPath).filter(f => f !== '.git');
      if (files.length === 0) {
        return { success: false, message: 'Clone completed but working tree is empty' };
      }
    } else {
      try {
        const files = fs.readdirSync(localPath).filter(f => f !== '.git');
        if (files.length === 0) {
          fs.rmSync(localPath, { recursive: true, force: true });
          const parentDir = path.dirname(localPath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          const result = await gitPty(
            ['clone', '--branch', branch, '--depth', '1', gitUrl, localPath],
            { timeout: 300_000 }
          );
          if (result.exitCode !== 0) {
            return { success: false, message: result.stderr || result.stdout || 'Clone failed' };
          }
        } else {
          await gitPty(['stash', '--include-untracked'], { cwd: localPath, timeout: 30_000 }).catch(() => {});
          const result = await gitPty(['pull', 'origin', branch], { cwd: localPath, timeout: 60_000 });
          await gitPty(['stash', 'drop'], { cwd: localPath, timeout: 10_000 }).catch(() => {});
          if (result.exitCode !== 0) {
            return { success: false, message: result.stderr || result.stdout || 'Pull failed' };
          }
        }
      } catch (e: any) {
        return { success: false, message: e.message };
      }
    }
  } catch (err: any) {
    return { success: false, message: (err.message || String(err)).slice(0, 200) };
  }
  return { success: true, message: '' };
}

// ─── Markdown Helpers ────────────────────────────────────────────────────────
const SKIP_DIRS = new Set([
  '.git', '.venv', '.deps', 'node_modules', '__pycache__',
  '.next', '.cache', 'dist', 'build', 'target', 'vendor', '.svn',
  '.tox', '.eggs', '*.egg-info',
  // also skip bare 'venv' directories (common in Python projects)
  'venv', '.venv', 'ENV', 'env',
  // skip Python package caches and site-packages
  'site-packages', 'site_packages',
]);

function scanMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return files; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        scanMarkdownFiles(full, files);
      }
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.MD')) {
      files.push(full);
    }
  }
  return files;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function extractTitle(content: string, relPath: string): string {
  // Priority 1: first Markdown H1 (# title)
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) return h1Match[1].trim();

  // Priority 2: first H2 / H3 as fallback
  const h2Match = content.match(/^#{2,3}\s+(.+)/m);
  if (h2Match) return h2Match[1].trim();

  // Priority 3: frontmatter title field (handles multi-line YAML frontmatter)
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (fmMatch) {
    const fmBody = fmMatch[1];
    const titleLine = fmBody.split('\n').find(l => l.trimStart().startsWith('title:'));
    if (titleLine) {
      const tv = titleLine.split('title:')[1].trim().replace(/^["']|["']$/g, '');
      if (tv) return tv.trim();
    }
  }

  // Priority 4: derive from filename (strip extension, split on separators)
  const filename = relPath ? relPath.split('/').pop() || '' : '';
  const basename = filename.replace(/\.[^.]+$/, ''); // strip extension
  return basename
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '无标题';
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, '');
}

// ─── Document Upsert ─────────────────────────────────────────────────────────
function upsertRepoDocument(
  repoId: number,
  filePath: string,
  title: string,
  relPath: string,
  content: string,
  hash: string
) {
  const existing = db.select().from(repoDocuments)
    .where(eq(docT.repoId, repoId))
    .all()
    .filter(d => d.filePath === filePath);

  if (existing.length > 0) {
    db.update(repoDocuments)
      .set({
        title,
        relPath,
        contentHash: hash,
        content,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(docT.id, existing[0].id))
      .run();
  } else {
    db.insert(repoDocuments)
      .values({ repoId, filePath, title, relPath, contentHash: hash, content })
      .run();
  }
}

function deleteRepoDocuments(repoId: number, filePath: string) {
  db.delete(repoDocuments)
    .where(and(eq(docT.repoId, repoId), eq(docT.filePath, filePath)))
    .run();
}

// ─── Sync ────────────────────────────────────────────────────────────────────
export async function syncRepo(
  repoId: number,
  localPath: string,
  url: string,
  branch: string
) {
  const repo = getRepoById(repoId);
  if (!repo) return { success: false, message: 'Repo not found', added: 0, updated: 0, removed: 0 };

  if (!validateRepoUrl(url) || !validateLocalPath(localPath)) {
    return { success: false, message: 'Invalid URL or path', added: 0, updated: 0, removed: 0 };
  }

  const isNew = !fs.existsSync(localPath) ||
    fs.readdirSync(localPath).filter(f => f !== '.git').length === 0;

  const gitResult = await gitCloneOrPull(url, branch, localPath, isNew);
  if (!gitResult.success) {
    return { success: false, message: gitResult.message, added: 0, updated: 0, removed: 0 };
  }

  // Scan .md files (SKIP_DIRS enforced inside)
  const mdFiles = scanMarkdownFiles(localPath);
  const newHashes = new Map<string, string>();
  for (const f of mdFiles) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      newHashes.set(f, computeHash(content));
    } catch (_e) {}
  }

  const existing = getDocumentsByRepoId(repoId);
  const existingPaths = new Map(existing.map(d => [d.filePath, d]));
  let added = 0, updated = 0, removed = 0;
  const newPaths = new Set(newHashes.keys());

  for (const entry of Array.from(newHashes.entries())) {
    const filePath = entry[0];
    const hash = entry[1];
    const relPath = path.relative(localPath, filePath);
    let rawContent = '';
    let title = '';
    try {
      rawContent = fs.readFileSync(filePath, 'utf8');
      title = extractTitle(rawContent, relPath);
    } catch (_e) {}
    const cleanContent = stripFrontmatter(rawContent);
    const existingDoc = existingPaths.get(filePath);

    if (!existingDoc || existingDoc.contentHash !== hash) {
      upsertRepoDocument(repoId, filePath, title, relPath, cleanContent, hash);
      if (existingDoc) updated++; else added++;
      updateFts('github_md', `${repoId}:${relPath}`, title, cleanContent).catch(() => {});
    }
  }

  for (const doc of existing) {
    if (!newPaths.has(doc.filePath)) {
      deleteRepoDocuments(repoId, doc.filePath);
      removed++;
    }
  }

  db.update(repoSources)
    .set({ lastSyncAt: new Date().toISOString() })
    .where(eq(srcT.id, repoId))
    .run();

  return {
    success: true,
    message: isNew ? 'Cloned successfully' : 'Pulled successfully',
    added, updated, removed,
  };
}