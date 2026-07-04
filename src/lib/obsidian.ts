// @ts-nocheck
/**
 * Obsidian Vault 同步
 *
 * 扫描 vault 目录下所有 .md 文件，计算 content hash，
 * 对新增/修改的文件调 updateEmbeddings 写入向量；删除已不存在的文件的向量。
 * 同步状态记到 kb_sources 表（sourceType='obsidian'）。
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, initDb } from './db/index';
import { kbSources, embeddings } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { updateEmbeddings } from './embeddings';

const DEFAULT_VAULT =
  process.env.OBSIDIAN_VAULT_DIR || path.join(process.cwd(), 'data', 'obsidian-vault');

const EXCLUDED_DIRS = ['.obsidian', '_templates', '_attachments', '.trash', 'node_modules', '.git'];

export interface ObsidianSyncResult {
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  total: number;
}

/**
 * 同步 Obsidian vault 到 embeddings 表。
 *
 * @param vaultPath vault 根目录路径（默认用 env OBSIDIAN_VAULT_DIR 或 cwd/data/obsidian-vault）
 */
export async function syncObsidianVault(
  vaultPath: string = DEFAULT_VAULT
): Promise<ObsidianSyncResult> {
  initDb();

  if (!fs.existsSync(vaultPath)) {
    throw new Error(`Vault not found: ${vaultPath}`);
  }
  const stat = fs.statSync(vaultPath);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${vaultPath}`);
  }

  const vaultName = path.basename(path.resolve(vaultPath));

  // 1. getOrCreate kb_sources row
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
        vaultPath: path.resolve(vaultPath),
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

  // 2. 读旧 fileMap（relPath → hash）
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

  // 3. 递归扫 *.md
  const newFileMap: Record<string, string> = {};
  const scannedFiles: { relPath: string; content: string; hash: string }[] = [];
  walkMarkdown(vaultPath, vaultPath, scannedFiles, newFileMap);

  // 4. 对每个文件：hash 变化 → updateEmbeddings
  let added = 0;
  let updated = 0;
  for (const f of scannedFiles) {
    const oldHash = oldFileMap[f.relPath];
    if (!oldHash) {
      added++;
    } else if (oldHash !== f.hash) {
      updated++;
    } else {
      // 内容没变，跳过
      continue;
    }

    try {
      await updateEmbeddings('obsidian_note', `obsidian:${f.relPath}`, f.content);
    } catch (err) {
      console.error('[obsidian] updateEmbeddings failed:', f.relPath, err);
    }
  }

  // 5. 删除 vault 里已不存在的 obsidian_note docId 对应的 embeddings
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
      } catch (err) {
        console.error('[obsidian] deleteEmbeddings failed:', oldRelPath, err);
      }
    }
  }

  // 6. 更新 kb_sources
  const now = new Date().toISOString();
  db.update(kbSources)
    .set({
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

/**
 * 递归扫 .md 文件，跳过 EXCLUDED_DIRS。
 */
function walkMarkdown(
  rootDir: string,
  currentDir: string,
  out: { relPath: string; content: string; hash: string }[],
  fileMap: Record<string, string>
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (EXCLUDED_DIRS.includes(entry.name)) continue;

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(rootDir, fullPath, out, fileMap);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const relPath = path.relative(rootDir, fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
        out.push({ relPath, content, hash });
        fileMap[relPath] = hash;
      } catch (err) {
        console.error('[obsidian] read failed:', fullPath, err);
      }
    }
  }
}
