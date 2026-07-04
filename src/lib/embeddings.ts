// @ts-nocheck
/**
 * Embedding 向量化 + 语义检索
 *
 * 通过 AI_BASE_URL/v1/embeddings（OpenAI 兼容）算向量，存到 SQLite 的 embeddings 表。
 * 检索时全表扫描做 cosine 相似度，数据量 <10 万 chunk JS 端够用。
 */

import { db, sqlite, initDb } from './db/index';
import { embeddings } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { chunkMarkdown, type Chunk } from './chunk';

const EMBED_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const AI_BASE_URL = (process.env.AI_BASE_URL || '').trim();
const AI_API_KEY = (process.env.AI_API_KEY || '').trim();

export type EmbeddingDocType = 'wiki_page' | 'repo_doc' | 'obsidian_note';

/**
 * 调 AI_BASE_URL/v1/embeddings 批量算向量。
 * OpenAI 兼容接口：POST {model, input: string[]} → {data: [{embedding: number[]}]}
 *
 * 若 batch > 32，分批调用避免单次请求过大。
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!AI_BASE_URL || !AI_API_KEY) {
    throw new Error('AI_BASE_URL/AI_API_KEY not configured for embeddings');
  }

  const BATCH = 32;
  const result: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${AI_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`embed API ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const vecs: number[][] = (data.data || []).map((d: any) => d.embedding as number[]);
      result.push(...vecs);
    } finally {
      clearTimeout(timeout);
    }
  }

  return result;
}

/**
 * 镜像 updateFts 模式：先删后插。
 * 若不提供 chunks，内部用 chunkMarkdown(content) 切分。
 */
export async function updateEmbeddings(
  docType: EmbeddingDocType,
  docId: string,
  content: string,
  chunks?: Chunk[]
): Promise<void> {
  initDb();

  // 先删
  db.delete(embeddings)
    .where(and(eq(embeddings.docType, docType), eq(embeddings.docId, docId)))
    .run();

  const finalChunks = chunks && chunks.length > 0 ? chunks : chunkMarkdown(content);
  if (finalChunks.length === 0) return;

  // 批量 embed
  const vecs = await embed(finalChunks.map(c => c.text));
  if (vecs.length !== finalChunks.length) {
    console.error('[embeddings] vec count mismatch:', vecs.length, 'expected', finalChunks.length);
    return;
  }

  // 逐条插入
  const now = new Date().toISOString();
  for (let i = 0; i < finalChunks.length; i++) {
    db.insert(embeddings)
      .values({
        docType,
        docId,
        chunkIndex: finalChunks[i].idx,
        content: finalChunks[i].text,
        embeddingJson: JSON.stringify(vecs[i]),
        model: EMBED_MODEL,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
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
  score: number; // cosine 0~1
}

/**
 * 语义检索：embed query → 全表 cosine top-k。
 *
 * @param query 用户问题
 * @param topK 返回前 K 条（默认 8）
 * @param opts.docTypes 限定检索的 docType（默认全部三种）
 * @param opts.minScore 最低 cosine 阈值（默认 0.25）
 */
export async function semanticSearch(
  query: string,
  topK: number = 8,
  opts?: { docTypes?: EmbeddingDocType[]; minScore?: number }
): Promise<SemanticHit[]> {
  initDb();

  const [qVec] = await embed([query]);
  if (!qVec || qVec.length === 0) return [];

  const types = opts?.docTypes || ['wiki_page', 'repo_doc', 'obsidian_note'];
  const placeholders = types.map(() => '?').join(',');
  const rawSqlite: any = sqlite;
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
    try {
      vec = JSON.parse(r.embedding_json);
    } catch {
      continue;
    }
    if (!Array.isArray(vec) || vec.length === 0) continue;
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
