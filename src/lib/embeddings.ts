// @ts-nocheck
/**
 * Embedding 向量化 + 语义检索
 * 通过本地 Python 脚本+fastembed 算向量，存到 SQLite 的 embeddings 表。
 */

import { db, sqlite, initDb } from './db/index';
import { embeddings } from './db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { chunkMarkdown } from './chunk';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { spawn as nodeSpawn } from 'child_process';

export type EmbeddingDocType = 'wiki_page' | 'repo_doc' | 'obsidian_note';

const EMBED_TIMEOUT_MS = 600_000;

interface EmbedOutputItem {
  embedding: number[];
  index: number;
  object: 'embedding';
}

/** 调用本地 embed.py 批量算向量 */
async function embedLocal(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const script = process.env.EMBED_SCRIPT || '/home/sz/workspace/scripts/embed.py';
  const pythonBin = process.env.EMBED_PYTHON || '/home/sz/workspace/.venv/bin/python3';

  const clean = texts.map(t => {
    if (t == null) return ' ';
    if (typeof t !== 'string') return String(t);
    return t;
  });

  // Use stdin pipe instead of temp file (avoid disk I/O issues with large payloads)
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(pythonBin, [script], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PYTHONIOENCODING: 'utf-8',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    // Write input as piped JSON
    child.stdin.write(JSON.stringify({ input: clean }));
    child.stdin.end();

    child.on('close', (code) => {
      if (code !== 0) {
        const tcMatch = stderr.match(/"text_count":\s*(\d+)/);
        const tc = tcMatch ? tcMatch[1] : '?';
        reject(new Error(`embed.py exit=${code}, texts=${tc}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        if (!data.data || !Array.isArray(data.data)) {
          reject(new Error('embed.py returned unexpected payload'));
          return;
        }
        const sorted = (data.data as EmbedOutputItem[]).sort((a, b) => a.index - b.index);
        resolve(sorted.map(d => d.embedding as number[]));
      } catch (e) {
        reject(new Error(`embed.py JSON parse failed: ${e.message}, stdout: ${stdout.slice(0, 200)}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * 更新单个 doc 的 embedding
 */
export async function updateEmbeddings(
  docType: EmbeddingDocType,
  docId: string,
  content: string,
  title?: string,
): Promise<void> {
  initDb();
  if (!content && !title) return;

  const fullContent = [title, content].filter(Boolean).join('\n\n');
  const chunks = chunkMarkdown(fullContent);
  const finalChunks = chunks?.length ? chunks : chunkMarkdown(content);

  if (!finalChunks || finalChunks.length === 0) return;

  const texts = finalChunks.map(c => String(c.text ?? '')).filter(Boolean);
  if (texts.length === 0) return;

  const vecs = await embedLocal(texts);
  if (!vecs || vecs.length === 0) return;

  // 删除旧 embeddings
  db.delete(embeddings)
    .where(and(eq(embeddings.docType, docType), eq(embeddings.docId, docId)))
    .run();

  const now = new Date().toISOString();
  for (let i = 0; i < finalChunks.length; i++) {
    const c = finalChunks[i];
    db.insert(embeddings).values({
      docType,
      docId,
      chunkIndex: c.idx,
      content: String(c.text ?? ''),
      embeddingJson: JSON.stringify(vecs[i]),
      model: 'fastembed-multilingual-384',
      createdAt: now,
      updatedAt: now,
    }).run();
  }
}

/**
 * 批量更新多个 docs 的 embedding（所有 chunks 合并成一次 Python 调用）
 */
export async function batchEmbed(
  items: { docType: EmbeddingDocType; docId: string; title?: string; content?: string }[]
): Promise<{ total: number; failed: number }> {
  initDb();
  if (items.length === 0) return { total: 0, failed: 0 };

  const flatItems: { docType: EmbeddingDocType; docId: string; chunkIndex: number; text: string }[] = [];
  const allTexts: string[] = [];

  for (const item of items) {
    const fullContent = String(item.title ?? '') + '\n\n' + String(item.content ?? '');
    const chunks = chunkMarkdown(fullContent);
    for (const chunk of chunks) {
      const text = String(chunk.text ?? '');
      if (!text) continue;
      flatItems.push({ docType: item.docType, docId: item.docId, chunkIndex: chunk.idx, text });
      allTexts.push(text);
    }
  }

  if (allTexts.length === 0) return { total: 0, failed: 0 };

  const allVecs = await embedLocal(allTexts);
  if (allVecs.length !== flatItems.length) {
    throw new Error(`Embedding count mismatch: got ${allVecs.length}, expected ${flatItems.length}`);
  }

  for (const item of items) {
    db.delete(embeddings)
      .where(and(eq(embeddings.docType, item.docType), eq(embeddings.docId, item.docId)))
      .run();
  }

  const now = new Date().toISOString();
  for (let i = 0; i < flatItems.length; i++) {
    const fi = flatItems[i];
    db.insert(embeddings).values({
      docType: fi.docType,
      docId: fi.docId,
      chunkIndex: fi.chunkIndex,
      content: fi.text,
      embeddingJson: JSON.stringify(allVecs[i]),
      model: 'fastembed-multilingual-384',
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  return { total: flatItems.length, failed: 0 };
}

export async function deleteEmbeddings(docType: EmbeddingDocType, docId: string): Promise<void> {
  initDb();
  db.delete(embeddings)
    .where(and(eq(embeddings.docType, docType), eq(embeddings.docId, docId)))
    .run();
}

export interface SemanticHit {
  docType: string;
  docId: string;
  chunkIndex: number;
  content: string;
  score: number;
}

export async function semanticSearch(
  query: string,
  topK = 8,
  opts?: { docTypes?: EmbeddingDocType[]; minScore?: number }
): Promise<SemanticHit[]> {
  initDb();
  const [qVec] = await embedLocal([query]);
  if (!qVec?.length) return [];

  const types = opts?.docTypes ?? ['wiki_page', 'repo_doc', 'obsidian_note'];
  const placeholders = types.map(() => '?').join(',');
  const rawSqlite = sqlite as any;
  const rows = rawSqlite
    .prepare(
      `SELECT doc_type, doc_id, chunk_index, content, embedding_json
       FROM embeddings WHERE doc_type IN (${placeholders})`
    )
    .all(...types) as any[];

  const minScore = opts?.minScore ?? 0.25;
  const scored: SemanticHit[] = [];
  for (const r of rows) {
    let vec: number[];
    try { vec = JSON.parse(r.embedding_json); } catch { continue; }
    if (!Array.isArray(vec) || !vec.length) continue;
    const score = cosine(qVec, vec);
    if (score >= minScore) {
      scored.push({
        docType: r.doc_type,
        docId: r.doc_id,
        chunkIndex: r.chunk_index,
        content: r.content,
        score,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}