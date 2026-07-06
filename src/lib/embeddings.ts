// @ts-nocheck
/**
 * Embedding 向量化 + 语义检索
 *
 * 通过本地 Python 脚本（纯 stdlib）算向量，存到 SQLite 的 embeddings 表。
 * 无需外部 API / GPU / numpy。
 */

import { db, sqlite, initDb } from './db/index';
import { embeddings } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { chunkMarkdown, type Chunk } from './chunk';
import { execSync } from 'child_process';

export type EmbeddingDocType = 'wiki_page' | 'repo_doc' | 'obsidian_note';

/** 调用本地 embed.py 批量算向量 */
async function embedLocal(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const script = process.env.EMBED_SCRIPT || '/home/sz/workspace/scripts/embed.py';
  const pythonBin = process.env.EMBED_PYTHON || '/home/sz/workspace/.venv/bin/python3';
  const inputJson = JSON.stringify({ input: texts });

  return new Promise((resolve, reject) => {
    const child = require('child_process').spawn(pythonBin, [script], {
      timeout: 30000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`embed.py exited ${code}: ${stderr}`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        if (!data.data || !Array.isArray(data.data)) {
          reject(new Error('embed.py returned unexpected payload'));
          return;
        }
        resolve(data.data.map((d: any) => d.embedding as number[]));
      } catch (e: any) {
        reject(new Error(`embed.py JSON parse failed at char ${stdout.slice(0, 50)}: ${e.message}`));
      }
    });

    child.on('error', reject);
    child.stdin.write(inputJson, () => { child.stdin.end(); });
  });
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
  const vecs = await embedLocal(finalChunks.map(c => c.text));
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
        model: 'fastembed-multilingual-384',
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

  const [qVec] = await embedLocal([query]);
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
