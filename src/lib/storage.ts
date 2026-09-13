import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.env.DB_PATH || './data/app.db');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.dirname(DB_PATH));

function resolvePath(relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.includes('\0')) {
    throw new Error('Invalid storage path');
  }

  const fullPath = path.resolve(DATA_DIR, relativePath);
  const relative = path.relative(DATA_DIR, fullPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Path traversal denied');
  }
  return fullPath;
}

export function readMarkdown(relativePath: string): string {
  if (!relativePath) return '';
  const fullPath = resolvePath(relativePath);
  if (!existsSync(fullPath)) return '';
  return readFileSync(fullPath, 'utf-8');
}

export function writeMarkdown(relativePath: string, content: string): void {
  if (!relativePath) throw new Error('Storage path is required');
  const fullPath = resolvePath(relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

export function deleteFile(relativePath: string): void {
  if (!relativePath) return;
  const fullPath = resolvePath(relativePath);
  rmSync(fullPath, { force: true });
}

export function fileExists(relativePath: string): boolean {
  if (!relativePath) return false;
  return existsSync(resolvePath(relativePath));
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

export function getExcerpt(content: string, maxLen = 200): string {
  const cleaned = content.replace(/[#*`>\[\]!]/g, '').replace(/\n+/g, ' ').trim();
  return cleaned.slice(0, maxLen);
}
