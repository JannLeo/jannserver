// @ts-nocheck
/**
 * 知识库搜索 — 多 Agent RAG 的底层检索引擎
 *
 * 提取自 /api/ai/ask/route.ts，复用了：
 * - semanticSearch（语义向量搜索，来自 embeddings.ts）
 * - FTS 全文搜索（rawSearch）
 * - 重排序（rerankAndSelect）
 * - 查询改写（buildSearchQueries）
 * - 仓库提示检测（detectRepoHint）
 * - 概念文档兜底（fetchConceptDocFallback）
 */

import { db, sqlite, initDb } from '../db/index';
import { searchFts, repoDocuments, repoSources } from '../db/schema';
import { or, like } from 'drizzle-orm';
import { semanticSearch, type SemanticHit } from '../embeddings';

export type { SemanticHit };

const MAX_DOC_CHARS = 2000;
const MAX_TOTAL_CHARS = 12000;
const TOP_K = 8;

// ─── 工具函数（复用自 ask/route.ts）─────────────────────────────────────────

export function tokenize(text: string): string[] {
  return text
    .replace(/[？\?\.\，\,，。\.！\!、、\'\"\'""【】\[\]（）\(\)]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

export function extractEnglishTokens(text: string): string[] {
  const results = new Set<string>();
  const wordMatches = text.matchAll(/[a-zA-Z]{2,}/g);
  const words: string[] = [];
  for (const m of wordMatches) { words.push(m[0]); }
  for (const w of words) { results.add(w.toLowerCase()); }
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, words.length + 1); j++) {
      results.add(words.slice(i, j).join(' ').toLowerCase());
    }
  }
  return Array.from(results);
}

export function buildSearchQueries(question: string): string[] {
  const q = question.trim();
  const queries: string[] = [q];
  const tokens = tokenize(q);
  queries.push(...tokens);
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, tokens.length); j++) {
      queries.push(tokens[i] + ' ' + tokens[j]);
    }
  }
  queries.push(...extractEnglishTokens(q));
  return [...new Set(queries)];
}

export function detectRepoHint(question: string): string | null {
  const q = question.toLowerCase();
  if (/worldquant|brain\s*platform|fitness|sharpe|turnover|neutralization|alpha\s*(factor|check|list)|submission\s*check/i.test(q)) {
    return 'worldquant';
  }
  if (/comp1521|syscall|mips|assembly|寄存器|c\x2d?language|lecture|悉尼大学/i.test(q)) {
    return 'teach';
  }
  if (/工作\s*总结|周报|日报|项目\s*总结|robin/i.test(q)) {
    return 'summary-for-work';
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n\n...（已截断）';
}

// ─── FTS 搜索（复用自 ask/route.ts）─────────────────────────────────────────

interface RawSearchResult {
  docType: string;
  docId: string;
  title: string;
  content?: string;
  repoName?: string;
  relPath?: string;
  repoId?: number;
}

export function rawSearch(query: string): RawSearchResult[] {
  const results: RawSearchResult[] = [];
  const seen = new Map<string, number>();
  const pattern = `%${query}%`;

  try {
    const rows = db
      .select({ docType: searchFts.docType, docId: searchFts.docId, title: searchFts.title, content: searchFts.content })
      .from(searchFts)
      .where(or(like(searchFts.title, pattern), like(searchFts.content, pattern)))
      .limit(50)
      .all();
    for (const row of rows as any[]) {
      const key = `fts:${row.docType}:${row.docId}`;
      const contentLen = (row.content || '').length;
      const entry: RawSearchResult = { docType: String(row.docType || ''), docId: String(row.docId || ''), title: String(row.title || ''), content: String(row.content || '') };
      if (!seen.has(key)) { seen.set(key, results.length); results.push(entry); }
      else if (contentLen > (results[seen.get(key)!]?.content?.length || 0)) { results[seen.get(key)!] = entry; }
    }
  } catch (err) { console.error('[rawSearch] fts error:', err); }

  try {
    const repoRows = db
      .select({ id: repoDocuments.id, title: repoDocuments.title, content: repoDocuments.content, relPath: repoDocuments.relPath, repoId: repoDocuments.repoId })
      .from(repoDocuments)
      .where(or(like(repoDocuments.title, pattern), like(repoDocuments.content, pattern)))
      .limit(50)
      .all() as any[];

    const nameMap = new Map<number, string>();
    const srcRows = db.select({ id: repoSources.id, name: repoSources.name }).from(repoSources).all() as any[];
    for (const s of srcRows) nameMap.set(s.id, s.name);

    for (const row of repoRows) {
      const key = `fts:github_md:${row.id}`;
      const contentLen = (row.content || '').length;
      const repoName = nameMap.get(row.repoId) || '';
      const entry: RawSearchResult = { docType: 'github_md', docId: String(row.id), title: String(row.title || ''), content: String(row.content || ''), repoName, relPath: String(row.relPath || ''), repoId: row.repoId };
      if (!seen.has(key)) { seen.set(key, results.length); results.push(entry); }
      else if (contentLen > (results[seen.get(key)!]?.content?.length || 0)) { results[seen.get(key)!] = entry; }
    }
  } catch (err) { console.error('[rawSearch] repo error:', err); }

  return results;
}

// ─── 重排序（复用自 ask/route.ts）───────────────────────────────────────────

export interface ScoredSource {
  docType: string;
  docId: string;
  repoId: number | null;
  repoName: string;
  title: string;
  relPath: string;
  content: string;
  score: number;
  url: string;
}

export function rerankAndSelect(docs: RawSearchResult[], question: string, repoHint: string | null): ScoredSource[] {
  const keywords = tokenize(question.toLowerCase());
  const coreTerms = keywords.filter(k => k.length >= 3);
  const allTerms = [...new Set([
    ...coreTerms,
    ...question.toLowerCase().split(/\s+/).filter(t => t.length >= 2),
  ])];

  const matchesAny = (text: string, terms: string[]) => {
    const t = text.toLowerCase();
    return terms.some(term => t.includes(term));
  };

  const scored: (ScoredSource & { _rawContent: string })[] = docs.map(doc => {
    let score = 0;
    const title = doc.title || '';
    const tLower = title.toLowerCase();
    const content = doc.content || '';
    const relPath = doc.relPath || '';
    const repoName = doc.repoName || '';

    if (allTerms.some(t => tLower === t)) score += 100;
    if (matchesAny(tLower, coreTerms)) score += 80;
    if (repoHint && repoName.toLowerCase() === repoHint) score += 80;
    if (matchesAny(relPath, coreTerms)) score += 60;
    if (matchesAny(content.slice(0, 5000), coreTerms)) score += 40;
    if (doc.docType === 'github_md') score += 10;
    if (/^无标题$|^Untitled$|^未命名$|^no title$/i.test(title) || title.length < 4) score -= 30;
    const highRelevance = ['sharpe', 'fitness', 'alpha', 'turnover', 'neutral', 'submission', 'comp1521', 'syscall', 'mips', '教会, 教程, 讲义', '作业', '周报', '日报'];
    if (matchesAny(tLower, highRelevance)) score += 5;

    let url = '/repos';
    if (doc.docType === 'github_md' && doc.repoId) url = `/repos?repoId=${doc.repoId}&docId=${doc.docId}`;
    else if (doc.docType === 'note') url = `/notes/${doc.docId}`;
    else if (doc.docType === 'memo') url = '/memos';
    else if (doc.docType === 'daily') url = `/daily/${doc.docId}`;

    return { docType: doc.docType, docId: doc.docId, repoId: doc.repoId || null, repoName, title, relPath, content, score, url, _rawContent: content };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b._rawContent.length || 0) - (a._rawContent.length || 0);
  });

  return scored.slice(0, TOP_K);
}

// ─── 构建上下文（复用自 ask/route.ts）────────────────────────────────────────

export function buildContextAndSources(docs: ScoredSource[]): { prompt: string; sources: any[] } {
  // Upgrade content for short github_md docs
  const githubMdDocs = docs.filter(d => d.docType === 'github_md' && (d.content?.length || 0) < 2000);
  if (githubMdDocs.length > 0) {
    try {
      const ids = githubMdDocs.map(d => parseInt(d.docId, 10)).filter(n => !isNaN(n));
      if (ids.length > 0) {
        const idList = ids.join(',');
        const rawSqlite: any = sqlite;
        const upgradeRows = rawSqlite
          .prepare(`SELECT rd.id, rd.content, rd.rel_path, rs.name as repo_name
                    FROM repo_documents rd
                    LEFT JOIN repo_sources rs ON rd.repo_id = rs.id
                    WHERE rd.id IN (${idList})`)
          .all();
        const contentMap = new Map<number, { content: string; relPath: string; repoName: string }>();
        for (const r of upgradeRows) contentMap.set(r.id, { content: r.content || '', relPath: r.rel_path || '', repoName: r.repo_name || '' });
        for (const doc of docs) {
          const n = parseInt(doc.docId, 10);
          if (!isNaN(n) && contentMap.has(n)) {
            const { content, relPath, repoName } = contentMap.get(n)!;
            if (content && content.length > (doc.content?.length || 0)) {
              doc.content = content;
              if (relPath) doc.relPath = relPath;
              if (repoName) doc.repoName = repoName;
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  const sources: any[] = [];
  const sourceSeen = new Set<string>();
  const contextParts: string[] = [];
  let totalLen = 0;

  for (const doc of docs) {
    const srcKey = `${doc.docType}::${doc.title}::${doc.repoName}`;
    if (sourceSeen.has(srcKey)) continue;
    if (doc.docType === 'github_md' && !doc.repoName && sources.some((s: any) => s.docType === 'github_md' && s.title === doc.title && s.repoName)) continue;
    sourceSeen.add(srcKey);

    let label = '';
    if (doc.docType === 'github_md') label = `【${doc.repoName || '知识库'}】${doc.title}`;
    else if (doc.docType === 'note') label = `【笔记】${doc.title}`;
    else if (doc.docType === 'memo') label = `【备忘录】${doc.title}`;
    else if (doc.docType === 'daily') label = `【日报】${doc.title}`;

    const excerpt = truncate(doc.content || '', MAX_DOC_CHARS);
    const block = `${label}\n${excerpt}\n`;
    if (totalLen + block.length > MAX_TOTAL_CHARS && totalLen > 0) break;
    contextParts.push(block);
    totalLen += block.length;

    sources.push({
      docType: doc.docType, docId: doc.docId, repoId: doc.repoId, repoName: doc.repoName,
      title: doc.title, relPath: doc.relPath, score: doc.score, url: doc.url,
      excerpt: excerpt.slice(0, 500),
    });
  }

  return { prompt: `### 知识库上下文\n${contextParts.join('\n')}`, sources };
}

// ─── 概念文档兜底（复用自 ask/route.ts）──────────────────────────────────────

export async function fetchConceptDocFallback(repoName: string, question: string): Promise<SemanticHit[]> {
  const words = question.match(/[\w一-鿿]{2,}/g) || [];
  if (words.length === 0) return [];
  const lowerWords = words.map(w => w.toLowerCase());

  try {
    initDb();
    const rawSqlite: any = sqlite;
    const pattern = `obsidian:${repoName}/%`;
    const rows = rawSqlite.prepare(
      `SELECT doc_id, content FROM embeddings WHERE doc_type = 'obsidian_note' AND doc_id LIKE ? ORDER BY doc_id`
    ).all(pattern);
    const scored: { docId: string; content: string; score: number }[] = [];
    for (const row of rows as any[]) {
      if (row.doc_id.includes('venv') || row.doc_id.includes('node_modules')) continue;
      const cl = (row.content || '').toLowerCase();
      let keywordHits = 0;
      for (const w of lowerWords) {
        if (cl.includes(w) || row.doc_id.toLowerCase().includes(w)) keywordHits++;
      }
      if (keywordHits === 0) continue;
      let score = keywordHits / lowerWords.length;
      if (lowerWords.some(w => row.doc_id.toLowerCase().includes(w))) score += 0.5;
      scored.push({ docId: row.doc_id, content: row.content, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map(h => ({
      docType: 'obsidian_note' as const, docId: h.docId,
      content: (h.content || '').slice(0, 500), score: h.score,
    }));
  } catch (err) {
    console.error('[fetchConceptDocFallback] failed:', err);
    return [];
  }
}

// ─── 主搜索入口 ─────────────────────────────────────────────────────────────

export interface SearchResult {
  semanticHits: SemanticHit[];
  ftsResults: ScoredSource[];
  sources: any[];
  searchContext: string;
  repoHint: string | null;
  topSemHits: SemanticHit[];
}

/**
 * 执行知识库搜索（语义 + FTS 混合）
 * 返回结构化搜索结果供 AI 生成使用
 */
export async function executeSearch(
  question: string,
  repoNameFromBody?: string | null,
  options: { topK?: number } = {}
): Promise<SearchResult> {
  initDb();
  const topK = options.topK ?? 800;
  const repoHint = repoNameFromBody ?? detectRepoHint(question);

  // 1. 语义搜索（向量相似度）
  let semanticHits: SemanticHit[] = [];
  try {
    semanticHits = await semanticSearch(question, topK, { minScore: 0.20 });
  } catch (err) {
    console.error('[executeSearch] semanticSearch failed:', err);
  }

  // 2. Repo hint 加权
  if (repoHint && semanticHits.length > 0) {
    for (const h of semanticHits) {
      let boost = 0;
      if (h.docType === 'obsidian_note') {
        const relPath = h.docId.replace(/^obsidian:/, '');
        if (relPath.startsWith(repoHint + '/') || relPath.startsWith(repoHint + '\\')) boost = 0.55;
      } else if (h.docType === 'wiki_page') boost = 0.55;
      h.score += boost;
    }
    semanticHits.sort((a, b) => b.score - a.score);
    semanticHits = semanticHits.slice(0, 8);
  }

  // 3. 概念文档兜底
  if (repoNameFromBody) {
    const conceptHits = await fetchConceptDocFallback(repoNameFromBody, question);
    if (conceptHits.length > 0) {
      const existingDocIds = new Set(semanticHits.map(h => h.docId));
      for (const ch of conceptHits) {
        if (!existingDocIds.has(ch.docId)) semanticHits.push(ch);
      }
      semanticHits.sort((a, b) => b.score - a.score);
      semanticHits = semanticHits.slice(0, 8);
    }
  }

  // 4. 构建语义搜索上下文
  let searchContext = '';
  let sources: any[] = [];
  let topSemHits: SemanticHit[] = [];

  if (semanticHits.length > 0) {
    topSemHits = semanticHits.slice(0, 8);
    const contextParts = topSemHits.map((h, i) => `[${i + 1}] docType=${h.docType} score=${h.score.toFixed(3)} docId=${h.docId}\n${h.content}`);
    searchContext = contextParts.join('\n\n---\n\n');
    sources = topSemHits.map(h => ({
      docType: h.docType, docId: h.docId,
      title: h.docId.replace(/^obsidian:|^wiki:|^(\d+:)?/, ''),
      url: h.docType === 'obsidian_note' ? '/repos' : h.docType === 'wiki_page' ? '/brain' : '/repos',
      excerpt: h.content.slice(0, 200),
      score: h.score,
    }));
  }

  // 5. 如果语义搜索不够，fallback 到 FTS
  let ftsResults: ScoredSource[] = [];
  if (!semanticHits.length || semanticHits.every(h => h.score < 0.3)) {
    const queries = buildSearchQueries(question);
    const seen = new Set<string>();
    const rawResults: RawSearchResult[] = [];
    for (const q of queries) {
      const rows = rawSearch(q);
      for (const row of rows) {
        const key = `${row.docType}:${row.docId}`;
        if (!seen.has(key)) { seen.add(key); rawResults.push(row); }
      }
    }
    const docsWithContent = rawResults.filter(d => (d.content || '').length > 50);
    ftsResults = rerankAndSelect(docsWithContent, question, repoHint);
    if (ftsResults.length > 0) {
      const { prompt: ftsPrompt, sources: ftsSources } = buildContextAndSources(ftsResults);
      searchContext = ftsPrompt;
      sources = ftsSources;
      topSemHits = [];
    }
  }

  return { semanticHits, ftsResults, sources, searchContext, repoHint, topSemHits };
}