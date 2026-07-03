import { db, initDb } from './db/index';
import { searchFts } from './db/schema';
import { eq, and, or, like } from 'drizzle-orm';

export type SearchDocType = 'note' | 'memo' | 'daily' | 'github_md' | 'wiki_page' | 'project_wiki';

export async function updateFts(
  docType: SearchDocType,
  docId: string,
  title: string,
  content: string
) {
  initDb();
  // 先删后插（按 docId 删除，兼容历史 wiki_page 字符串前缀 docId）
  db.delete(searchFts).where(eq(searchFts.docId, docId)).run();
  db.insert(searchFts).values({ docType, docId, title, content }).run();
}

export async function deleteFts(docId: string) {
  initDb();
  db.delete(searchFts).where(eq(searchFts.docId, docId)).run();
}

/**
 * 按 docType + docId 精确删除 search_fts 条目。
 *
 * 用于 project_wiki 这类不使用字符串前缀 docId 的场景：
 * project_wiki 的 docId 就是 pageId 数字字符串，必须按 doc_type+doc_id 双键删除，
 * 避免与其它文档类型同 docId 冲突。
 */
export async function deleteFtsByDoc(docType: SearchDocType, docId: string) {
  initDb();
  db.delete(searchFts)
    .where(and(eq(searchFts.docType, docType), eq(searchFts.docId, docId)))
    .run();
}

export interface SearchResult {
  docType: SearchDocType;
  docId: string;
  title: string;
}

export async function searchAll(
  query: string,
  docType?: SearchDocType
): Promise<SearchResult[]> {
  initDb();
  const { sql } = require('drizzle-orm');

  // 1. 优先 FTS5
  let results: SearchResult[] = [];
  const ftsQuery = query.replace(/[^\w\s\u4e00-\u9fa5]/g, ' ').trim();

  try {
    const rows = db.select({
      docType: searchFts.docType,
      docId: searchFts.docId,
      title: searchFts.title,
    })
    .from(searchFts)
    .where(
      docType
        ? sql`${searchFts.docType} = ${docType} AND ${searchFts.title} LIKE ${'%' + ftsQuery + '%'}`
        : sql`${searchFts.title} LIKE ${'%' + ftsQuery + '%'} OR ${searchFts.content} LIKE ${'%' + ftsQuery + '%'}`
    )
    .limit(50)
    .all();
    results = rows as SearchResult[];
  } catch {}

  // 2. FTS 结果少或中文短词 fallback LIKE
  if (results.length === 0 || /[\u4e00-\u9fa5]/.test(query)) {
    const likePattern = `%${query}%`;
    const rows2 = db.select({
      docType: searchFts.docType,
      docId: searchFts.docId,
      title: searchFts.title,
    })
    .from(searchFts)
    .where(
      docType
        ? sql`${searchFts.docType} = ${docType} AND (${searchFts.title} LIKE ${likePattern} OR ${searchFts.content} LIKE ${likePattern})`
        : sql`${searchFts.title} LIKE ${likePattern} OR ${searchFts.content} LIKE ${likePattern}`
    )
    .limit(50)
    .all();
    results = rows2 as SearchResult[];
  }

  return results;
}
