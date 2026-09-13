// @ts-nocheck
/**
 * Obsidian Vault 同步
 *
 * 扫描受配置根目录约束的 .md 文件，计算 content hash，
 * 对新增/修改文件更新 embeddings；删除已不存在文件的向量。
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, initDb } from './db/index';
import { kbSources, embeddings } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { updateEmbeddings } from './embeddings';

const DEFAULT_VAULT = path.resolve(
  process.env.OBSIDIAN_VAULT_DIR || path.join(process.cwd(), 'data', 'obsidian-vault'),
);

const EXCLUDED_DIRS = new Set([
  '.obsidian', '_templates', '_attachments', '.trash', 'node_modules', '.git',
]);
const MAX_FILES = 5000;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export interface ObsidianSyncResult {
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  total: number;
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function resolveVaultPath(requestedPath: string): { configuredRoot: string; vaultPath: string } {
  const candidate = path.resolve(requestedPath || DEFAULT_VAULT);
  if (!isPathInside(DEFAULT_VAULT, candidate)) {
    throw new Error('Requested vault path is outside OBSIDIAN_VAULT_DIR');
  }

  if (!fs.existsSync(DEFAULT_VAULT)) throw new Error('Configured Obsidian vault root does not exist');
  if (!fs.existsSync(candidate)) throw new Error('Requested Obsidian vault does not exist');

  const configuredRoot = fs.realpathSync(DEFAULT_VAULT);
  const vaultPath = fs.realpathSync(candidate);
  if (!isPathInside(configuredRoot, vaultPath)) {
    throw new Error('Requested vault resolves outside OBSIDIAN_VAULT_DIR');
  }
  if (!fs.statSync(vaultPath).isDirectory()) {
    throw new Error('Requested Obsidian vault is not a directory');
  }

  return { configuredRoot, vaultPath };
}

/**
 * 同步 Obsidian vault 到 embeddings 表。
 *
 * @param vaultPath vault 根目录或其子目录；不能越出 OBSIDIAN_VAULT_DIR。
 */
export async function syncObsidianVault(
  vaultPath: string = DEFAULT_VAULT
): Promise<ObsidianSyncResult> {
  initDb();

  const resolved = resolveVaultPath(vaultPath);
  const safeVaultPath = resolved.vaultPath;
  const vaultName = path.basename(safeVaultPath);

  let srcRow = db
    .select()
    .from(kbSources)
    .where(and(eq(kbSources.sourceType, 'obsidian'), eq(kbSources.name, vaultName)))
    .all() as any[];
  let sourceId: number;
  if (srcRow.length === 0) {
    const now = new Date().toISOString();
    const ins = db
      .insert(kbSources)
      .values({
        sourceType: 'obsidian',
        name: vaultName,
        vaultPath: safeVaultPath,
        fileCount: 0,
        lastSyncAt: null,
        fileMapJson: '{}',
        createdAt: now,
        updatedAt: now,
      })
      .run() as any;
    sourceId = Number(ins.lastInsertRowid);
  } else {
    sourceId = srcRow[0].id;
  }

  const srcRow2 = db
    .select()
    .from(kbSources)
    .where(eq(kbSources.id, sourceId))
    .get() as any;
  let oldFileMap: Record<string, string> = {};
  try {
    oldFileMap = JSON.parse(srcRow2.fileMapJson || '{}');
  } catch {
    oldFileMap = {};
  }

  const newFileMap: Record<string, string> = {};
  const scannedFiles: { relPath: string; content: string; hash: string }[] = [];
  const budget = { files: 0, bytes: 0 };
  walkMarkdown(safeVaultPath, safeVaultPath, scannedFiles, newFileMap, budget);

  let added = 0;
  let updated = 0;
  for (const file of scannedFiles) {
    const oldHash = oldFileMap[file.relPath];
    if (!oldHash) added++;
    else if (oldHash !== file.hash) updated++;
    else continue;

    try {
      await updateEmbeddings('obsidian_note', `obsidian:${file.relPath}`, file.content);
    } catch (error) {
      console.error('[obsidian] updateEmbeddings failed:', file.relPath, error);
    }
  }

  let removed = 0;
  for (const oldRelPath of Object.keys(oldFileMap)) {
    if (!(oldRelPath in newFileMap)) {
      try {
        db.delete(embeddings)
          .where(
            and(
              eq(embeddings.docType, 'obsidian_note'),
              eq(embeddings.docId, `obsidian:${oldRelPath}`)
            )
          )
          .run();
        removed++;
      } catch (error) {
        console.error('[obsidian] deleteEmbeddings failed:', oldRelPath, error);
      }
    }
  }

  const now = new Date().toISOString();
  db.update(kbSources)
    .set({
      vaultPath: safeVaultPath,
      fileCount: scannedFiles.length,
      lastSyncAt: now,
      fileMapJson: JSON.stringify(newFileMap),
      updatedAt: now,
    })
    .where(eq(kbSources.id, sourceId))
    .run();

  return {
    ok: true,
    added,
    updated,
    removed,
    total: scannedFiles.length,
  };
}

function walkMarkdown(
  rootDir: string,
  currentDir: string,
  out: { relPath: string; content: string; hash: string }[],
  fileMap: Record<string, string>,
  budget: { files: number; bytes: number },
): void {
  if (budget.files >= MAX_FILES || budget.bytes >= MAX_TOTAL_BYTES) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (budget.files >= MAX_FILES || budget.bytes >= MAX_TOTAL_BYTES) return;
    if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(currentDir, entry.name);

    // Never follow symlinks. A vault-controlled symlink could otherwise escape
    // the configured root and import unrelated host files into embeddings.
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      walkMarkdown(rootDir, fullPath, out, fileMap, budget);
      continue;
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;

    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_BYTES) continue;
      if (budget.bytes + stat.size > MAX_TOTAL_BYTES) return;

      const content = fs.readFileSync(fullPath, 'utf8');
      const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      if (relPath === '..' || relPath.startsWith('../') || path.isAbsolute(relPath)) continue;

      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
      out.push({ relPath, content, hash });
      fileMap[relPath] = hash;
      budget.files += 1;
      budget.bytes += stat.size;
    } catch (error) {
      console.error('[obsidian] read failed:', fullPath, error);
    }
  }
}
