import * as fs from 'node:fs';
import * as path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const REPOS_BASE_DIR = process.env.REPOS_BASE_DIR || path.join(DATA_DIR, 'repos');

function isUnder(child: string, parent: string): boolean {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return c === p || c.startsWith(p + path.sep);
}

export function getReposBaseRealPath(): string {
  try {
    return fs.realpathSync(REPOS_BASE_DIR);
  } catch {
    return path.resolve(REPOS_BASE_DIR);
  }
}

export function isPathUnderReposBase(absPath: string): boolean {
  const resolved = path.resolve(absPath);
  if (resolved.includes('..')) return false;

  if (isUnder(resolved, REPOS_BASE_DIR)) return true;

  try {
    const real = fs.realpathSync(absPath);
    const realBase = getReposBaseRealPath();
    return isUnder(real, realBase);
  } catch {
    return false;
  }
}
