import { db, initDb } from './db/index';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const DATA_DIR = process.env.DB_PATH?.replace('/app.db', '') || './data';

function resolvePath(relativePath: string): string {
  const p = path.join(DATA_DIR, relativePath);
  // 禁止路径穿越
  if (!p.startsWith(path.join(DATA_DIR))) throw new Error('Path traversal denied');
  return p;
}

export function readMarkdown(relativePath: string): string {
  const fullPath = resolvePath(relativePath);
  if (!existsSync(fullPath)) return '';
  return readFileSync(fullPath, 'utf-8');
}

export function writeMarkdown(relativePath: string, content: string): void {
  const fullPath = resolvePath(relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

export function deleteFile(relativePath: string): void {
  const fullPath = resolvePath(relativePath);
  const { rmSync } = require('fs');
  rmSync(fullPath, { force: true });
}

export function fileExists(relativePath: string): boolean {
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