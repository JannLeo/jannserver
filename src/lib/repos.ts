// @ts-nocheck
import * as fs from 'fs';
import * as nodePath from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { db } from './db/index';
import { updateFts } from './search';
import { eq, and } from 'drizzle-orm';
import { repoSources, repoDocuments } from './db/schema';
import { REPOS_BASE_DIR, isPathUnderReposBase } from './paths';

// @ts-ignore - Drizzle sqlite type inference issue with $defaultFn columns
const srcT = repoSources as any;
const docT = repoDocuments as any;
const path = nodePath;

const ALLOWED_REPO_OWNER = 'JannLeo';
const REPO_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'github.com') return null;
    if (u.username || u.password || u.search || u.hash) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts[0] !== ALLOWED_REPO_OWNER) return null;
    const repo = parts[1].endsWith('.git') ? parts[1].slice(0, -4) : parts[1];
    if (!REPO_NAME_RE.test(repo)) return null;
    return { owner: parts[0], repo };
  } catch {
    return null;
  }
}

function toSshUrl(httpsUrl: string): string {
  const parsed = parseRepoUrl(httpsUrl);
  if (!parsed) throw new Error('Invalid GitHub repository URL');
  return `git@github.com:${parsed.owner}/${parsed.repo}.git`;
}

// ─── Repo Validation ──────────────────────────────────────────────────────────
export function validateRepoUrl(url: string): boolean {
  return typeof url === 'string' && parseRepoUrl(url) !== null;
}

export function validateRepoName(name: string): boolean {
  return typeof name === 'string' && REPO_NAME_RE.test(name);
}

export function validateBranch(branch: string): boolean {
  if (typeof branch !== 'string' || !BRANCH_RE.test(branch)) return false;
  return !branch.includes('..') && !branch.includes('//') && !branch.endsWith('/') && !branch.endsWith('.lock');
}

export function validateLocalPath(localPath: string): boolean {
  return isPathUnderReposBase(localPath);
}

// ─── Repo CRUD ────────────────────────────────────────────────────────────────
export function getAllRepos() {
  return db.select().from(repoSources).all();
}

export function getRepoById(id: number) {
  return db.select().from(repoSources).where(eq(srcT.id, id)).get();
}

export function createRepo(data: { name: string; url: string; branch: string }) {
  if (!validateRepoName(data.name) || !validateRepoUrl(data.url) || !validateBranch(data.branch)) {
    throw new Error('Invalid repository configuration');
  }
  const localPath = path.join(REPOS_BASE_DIR, data.name);
  if (!validateLocalPath(localPath)) throw new Error('Invalid repository path');

  return db.insert(repoSources).values({
    name: data.name,
    url: data.url,
    branch: data.branch || 'main',
    localPath,
  }).returning().get();
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

// ─── Safe Git process helper ──────────────────────────────────────────────────
const GIT_ENV = {
  ...process.env,
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
  HTTP_PROXY: '',
  HTTPS_PROXY: '',
  http_proxy: '',
  https_proxy: '',
};

async function gitExec(
  args: string[],
  opts: { cwd?: string; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Never invoke a shell here. Repository URL, branch and local path remain
    // distinct argv entries, so shell metacharacters cannot become commands.
    const child = spawn('git', args, {
      env: GIT_ENV,
      cwd: opts.cwd || undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const maxOutput = 2 * 1024 * 1024;

    const append = (current: string, chunk: Buffer) => {
      if (current.length >= maxOutput) return current;
      return (current + chunk.toString()).slice(0, maxOutput);
    };

    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 3_000).unref();
    }, opts.timeout || 120_000);
    timer.unref();

    child.on('close', (code, signal) => {
      if (signal && !stderr) stderr = `git terminated by ${signal}`;
      finish(typeof code === 'number' ? code : 128);
    });
    child.on('error', (error) => {
      stderr = error.message;
      finish(128);
    });
  });
}

// ─── Git Clone/Pull ──────────────────────────────────────────────────────────
async function gitCloneOrPull(
  url: string,
  branch: string,
  localPath: string,
  isNew: boolean,
): Promise<{ success: boolean; message: string }> {
  if (!validateRepoUrl(url) || !validateBranch(branch) || !validateLocalPath(localPath)) {
    return { success: false, message: 'Invalid repository configuration' };
  }

  const gitUrl = toSshUrl(url);
  try {
    if (isNew) {
      const parentDir = path.dirname(localPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

      const result = await gitExec(
        ['clone', '--branch', branch, '--depth', '1', gitUrl, localPath],
        { timeout: 300_000 },
      );
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || result.stdout || 'Clone failed' };
      }
      const files = fs.readdirSync(localPath).filter((file) => file !== '.git');
      if (files.length === 0) {
        return { success: false, message: 'Clone completed but working tree is empty' };
      }
    } else {
      try {
        const files = fs.readdirSync(localPath).filter((file) => file !== '.git');
        if (files.length === 0) {
          fs.rmSync(localPath, { recursive: true, force: true });
          const parentDir = path.dirname(localPath);
          if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
          const result = await gitExec(
            ['clone', '--branch', branch, '--depth', '1', gitUrl, localPath],
            { timeout: 300_000 },
          );
          if (result.exitCode !== 0) {
            return { success: false, message: result.stderr || result.stdout || 'Clone failed' };
          }
        } else {
          await gitExec(['stash', 'push', '--include-untracked', '--message', 'jannserver-auto-sync'], {
            cwd: localPath,
            timeout: 30_000,
          }).catch(() => undefined);
          const result = await gitExec(['pull', '--ff-only', 'origin', branch], {
            cwd: localPath,
            timeout: 60_000,
          });
          if (result.exitCode !== 0) {
            return { success: false, message: result.stderr || result.stdout || 'Pull failed' };
          }
        }
      } catch (error: unknown) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: message.slice(0, 200) };
  }
  return { success: true, message: '' };
}

// ─── Markdown Helpers ────────────────────────────────────────────────────────
const SKIP_DIRS = new Set([
  '.git', '.venv', '.deps', 'node_modules', '__pycache__',
  '.next', '.cache', 'dist', 'build', 'target', 'vendor', '.svn',
  '.tox', '.eggs', '*.egg-info', 'venv', 'ENV', 'env',
  'site-packages', 'site_packages',
]);

function scanMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) scanMarkdownFiles(full, files);
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
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) return h1Match[1].trim();

  const h2Match = content.match(/^#{2,3}\s+(.+)/m);
  if (h2Match) return h2Match[1].trim();

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (fmMatch) {
    const titleLine = fmMatch[1].split('\n').find((line) => line.trimStart().startsWith('title:'));
    if (titleLine) {
      const title = titleLine.split('title:')[1].trim().replace(/^["']|["']$/g, '');
      if (title) return title.trim();
    }
  }

  const filename = relPath ? relPath.split('/').pop() || '' : '';
  return filename
    .replace(/\.[^.]+$/, '')
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
  hash: string,
) {
  const existing = db.select().from(repoDocuments)
    .where(and(eq(docT.repoId, repoId), eq(docT.filePath, filePath)))
    .get();

  if (existing) {
    db.update(repoDocuments)
      .set({
        title,
        relPath,
        contentHash: hash,
        content,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(docT.id, existing.id))
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
  branch: string,
) {
  const repo = getRepoById(repoId);
  if (!repo) return { success: false, message: 'Repo not found', added: 0, updated: 0, removed: 0 };

  if (!validateRepoUrl(url) || !validateBranch(branch) || !validateLocalPath(localPath)) {
    return { success: false, message: 'Invalid URL, branch or path', added: 0, updated: 0, removed: 0 };
  }

  const isNew = !fs.existsSync(localPath)
    || fs.readdirSync(localPath).filter((file) => file !== '.git').length === 0;

  const gitResult = await gitCloneOrPull(url, branch, localPath, isNew);
  if (!gitResult.success) {
    return { success: false, message: gitResult.message, added: 0, updated: 0, removed: 0 };
  }

  const mdFiles = scanMarkdownFiles(localPath);
  const newHashes = new Map<string, string>();
  for (const filePath of mdFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      newHashes.set(filePath, computeHash(content));
    } catch {
      // A file may disappear while a repository is being updated; skip it.
    }
  }

  const existing = getDocumentsByRepoId(repoId);
  const existingPaths = new Map(existing.map((doc) => [doc.filePath, doc]));
  let added = 0;
  let updated = 0;
  let removed = 0;
  const newPaths = new Set(newHashes.keys());

  for (const [filePath, hash] of newHashes.entries()) {
    const relPath = path.relative(localPath, filePath);
    let rawContent = '';
    let title = '';
    try {
      rawContent = fs.readFileSync(filePath, 'utf8');
      title = extractTitle(rawContent, relPath);
    } catch {
      continue;
    }

    const cleanContent = stripFrontmatter(rawContent);
    const existingDoc = existingPaths.get(filePath);
    if (!existingDoc || existingDoc.contentHash !== hash) {
      upsertRepoDocument(repoId, filePath, title, relPath, cleanContent, hash);
      if (existingDoc) updated += 1;
      else added += 1;

      updateFts('github_md', `${repoId}:${relPath}`, title, cleanContent).catch(() => undefined);
      import('./embeddings')
        .then(({ updateEmbeddings }) =>
          updateEmbeddings('repo_doc', `${repoId}:${relPath}`, `${title}\n\n${cleanContent}`),
        )
        .catch((error) => console.error('[repos] updateEmbeddings failed:', relPath, error));
    }
  }

  for (const doc of existing) {
    if (!newPaths.has(doc.filePath)) {
      deleteRepoDocuments(repoId, doc.filePath);
      removed += 1;
    }
  }

  db.update(repoSources)
    .set({ lastSyncAt: new Date().toISOString() })
    .where(eq(srcT.id, repoId))
    .run();

  return {
    success: true,
    message: isNew ? 'Cloned successfully' : 'Pulled successfully',
    added,
    updated,
    removed,
  };
}
