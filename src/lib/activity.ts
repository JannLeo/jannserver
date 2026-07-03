// @ts-nocheck
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { db } from './db/index';
import { repoSources } from './db/schema';
import { isPathUnderReposBase } from './paths';

const execFileAsync = promisify(execFile);

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  changedFiles: string[];
  changedFileCount: number;
}

export interface RepoActivity {
  repoId: number;
  repoName: string;
  commits: CommitInfo[];
}

export interface ActivityResult {
  date: string;
  repos: RepoActivity[];
  totalCommits: number;
}

// Server-local YYYY-MM-DD (avoid UTC drift)
export function getTodayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function parseGitLog(stdout: string): CommitInfo[] {
  if (!stdout || !stdout.trim()) return [];

  const commits: CommitInfo[] = [];
  // git log --name-only separates commits with a blank line
  const blocks = stdout.split(/\n\n/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    const header = lines[0];
    const parts = header.split('\t');
    if (parts.length < 4) continue;

    const [hash, author, date, message] = parts;
    const changedFiles = lines.slice(1).map(l => l.trim()).filter(Boolean);

    commits.push({
      hash,
      shortHash: hash.slice(0, 7),
      author,
      date,
      message,
      changedFiles,
      changedFileCount: changedFiles.length,
    });
  }
  return commits;
}

export async function getRepoActivity(date: string): Promise<ActivityResult> {
  if (!isValidDate(date)) {
    return { date: date || '', repos: [], totalCommits: 0 };
  }

  const repos = db.select().from(repoSources).all().filter(r => r.enabled);

  const since = `${date} 00:00:00`;
  const until = `${date} 23:59:59`;

  const results: RepoActivity[] = [];

  for (const repo of repos) {
    // Validate path is under REPOS_BASE_DIR (handles symlinks too)
    if (!isPathUnderReposBase(repo.localPath)) continue;

    // Resolve real path and re-validate
    let realPath: string;
    try {
      realPath = fs.realpathSync(repo.localPath);
    } catch {
      continue; // path doesn't exist
    }
    if (!isPathUnderReposBase(realPath)) continue;

    // Must be a git repo
    if (!fs.existsSync(path.join(realPath, '.git'))) continue;

    try {
      const { stdout } = await execFileAsync('git', [
        'log',
        `--since=${since}`,
        `--until=${until}`,
        '--pretty=format:%H%x09%an%x09%ad%x09%s',
        '--date=iso',
        '--name-only',
        '--max-count=50',
      ], {
        cwd: realPath,
        maxBuffer: 5 * 1024 * 1024,
        timeout: 10_000,
      });

      const commits = parseGitLog(stdout);
      if (commits.length > 0) {
        results.push({ repoId: repo.id, repoName: repo.name, commits });
      }
    } catch (_err) {
      // git log failed (no commits in range, timeout, or repo error): skip
    }
  }

  const totalCommits = results.reduce((sum, r) => sum + r.commits.length, 0);
  return { date, repos: results, totalCommits };
}
