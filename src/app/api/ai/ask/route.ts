// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db, sqlite, initDb } from '@/lib/db/index';
import { searchFts, repoDocuments, repoSources, wikiPages, wikiSpaces } from '@/lib/db/schema';
import { or, like, eq, and } from 'drizzle-orm';
import { searchWikiPages, getOrCreateSpace, recordWikiError } from '@/lib/wiki';
import {
  detectProjectContext,
  getOrCreateProjectSpace,
  searchProjectWiki,
  searchCodeSymbols,
  type ProjectWikiMatch,
  type CodeSymbolMatch,
} from '@/lib/projectBrain';
import {
  searchOntologyEntities,
  getOntologyContextEdges,
  type OntologyContextEdge,
} from '@/lib/projectOntology';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DOC_CHARS = 2000;
const MAX_TOTAL_CHARS = 12000;
const TOP_K = 8;

function tokenize(text: string): string[] {
  return text
    .replace(/[？\?\.\，\,，。\.！\!、、\'\"\'""【】\[\]（）\(\)]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

// ─── Repo-scoped keyword query detection ─────────────────────────────────────
// 已知仓库名
const KNOWN_REPO_NAMES = ['summary-for-work', 'worldquant', 'teach'];

// WorldQuant / BRAIN 常见概念关键词 + 中英文同义词扩展
const KEYWORD_SYNONYMS: Record<string, string[]> = {
  margin: ['margin', 'Margin', '保证金', '边际', '收益效率'],
  fitness: ['fitness', 'Fitness', '适应度', '拟合度'],
  turnover: ['turnover', 'Turnover', '换手率', '换手'],
  sharpe: ['sharpe', 'Sharpe', '夏普', '夏普比率'],
  neutralization: ['neutralization', 'Neutralization', '中性化', '中性'],
  decay: ['decay', 'Decay', '衰减', '衰减期'],
  alpha: ['alpha', 'Alpha', '阿尔法', '因子'],
  submission: ['submission', 'Submission', '提交', '提交检查'],
  backtest: ['backtest', 'Backtest', '回测'],
  leverage: ['leverage', 'Leverage', '杠杆'],
  exposure: ['exposure', 'Exposure', '敞口', '暴露'],
  beta: ['beta', 'Beta', '贝塔'],
  correlation: ['correlation', 'Correlation', '相关性', '相关'],
  drawdown: ['drawdown', 'Drawdown', '回撤'],
  volatility: ['volatility', 'Volatility', '波动率', '波动'],
  long: ['long', 'Long', '多头', '做多'],
  short: ['short', 'Short', '空头', '做空'],
};

interface RepoKeywordQuery {
  detected: boolean;
  repoName: string | null;
  repoId: number | null;
  keywords: string[];        // 原始关键词
  searchTerms: string[];     // 扩展后的搜索词（中英文同义词）
}

/**
 * 检测「repo 名 + 关键词」组合查询
 * 例如："worldquant里面什么是margin" → repo=worldquant, keyword=margin
 */
function detectRepoKeywordQuery(question: string): RepoKeywordQuery {
  const q = question.toLowerCase();
  const result: RepoKeywordQuery = { detected: false, repoName: null, repoId: null, keywords: [], searchTerms: [] };

  // 1. 检测 repo 名
  let detectedRepo: string | null = null;
  for (const repo of KNOWN_REPO_NAMES) {
    if (q.includes(repo.toLowerCase())) {
      detectedRepo = repo;
      break;
    }
  }
  if (!detectedRepo) return result;

  // 2. 检测关键词（英文原词 + 同义词）
  const detectedKeywords: string[] = [];
  const searchTerms = new Set<string>();

  for (const [canonical, synonyms] of Object.entries(KEYWORD_SYNONYMS)) {
    for (const syn of synonyms) {
      if (q.includes(syn.toLowerCase())) {
        detectedKeywords.push(canonical);
        // 把所有同义词都加入搜索词
        for (const s of synonyms) searchTerms.add(s);
        break; // 同一组同义词只加一次
      }
    }
  }

  if (detectedKeywords.length === 0) return result;

  // 3. 查询 repoId
  let repoId: number | null = null;
  try {
    const srcRow = db.select().from(repoSources).all().find(r => r.name === detectedRepo);
    if (srcRow) repoId = srcRow.id;
  } catch { /* ignore */ }

  result.detected = true;
  result.repoName = detectedRepo;
  result.repoId = repoId;
  result.keywords = [...new Set(detectedKeywords)];
  result.searchTerms = Array.from(searchTerms);
  return result;
}

// ─── WorldQuant 概念检测（用于 wiki_page 命中）─────────────────────────────
interface WQConceptDetection {
  detected: boolean;
  concepts: string[];      // canonical concept slugs
  searchTerms: string[];   // 所有同义词
}

/**
 * 检测问题是否包含 worldquant/WQ + 概念关键词
 * 仅当同时包含 repo 名和概念关键词时才触发
 */
function detectWorldQuantConcept(question: string): WQConceptDetection {
  const q = question.toLowerCase();
  // 必须包含 worldquant / WQ / BRAIN 平台
  if (!/worldquant|\bwq\b|brain\s*(平台|platform)/i.test(q)) {
    return { detected: false, concepts: [], searchTerms: [] };
  }
  // 复用 KEYWORD_SYNONYMS 检测概念
  const concepts: string[] = [];
  const searchTerms = new Set<string>();
  for (const [canonical, synonyms] of Object.entries(KEYWORD_SYNONYMS)) {
    for (const syn of synonyms) {
      if (q.includes(syn.toLowerCase())) {
        concepts.push(canonical);
        for (const s of synonyms) searchTerms.add(s);
        break;
      }
    }
  }
  if (concepts.length === 0) return { detected: false, concepts: [], searchTerms: [] };
  return { detected: true, concepts, searchTerms: Array.from(searchTerms) };
}

/**
 * 在指定 repo 内搜索关键词（限定 repo_id）
 */
function rawSearchInRepo(repoId: number, searchTerms: string[]): RawSearchResult[] {
  const results: RawSearchResult[] = [];
  const seen = new Set<string>();

  for (const term of searchTerms) {
    if (!term || term.length < 2) continue;
    const pattern = `%${term}%`;
    try {
      const repoRows = db
        .select({
          id: repoDocuments.id,
          title: repoDocuments.title,
          content: repoDocuments.content,
          relPath: repoDocuments.relPath,
          repoId: repoDocuments.repoId,
        })
        .from(repoDocuments)
        .where(and(eq(repoDocuments.repoId, repoId), or(like(repoDocuments.title, pattern), like(repoDocuments.content, pattern))))
        .limit(30)
        .all() as any[];

      for (const row of repoRows) {
        const key = `github_md:${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          docType: 'github_md',
          docId: String(row.id),
          title: String(row.title || ''),
          content: String(row.content || ''),
          relPath: String(row.relPath || ''),
          repoId: row.repoId,
          repoName: '', // will be filled later
        });
      }
    } catch (err) { console.error('[ai.ask] rawSearchInRepo error:', err); }
  }

  // 填充 repoName
  try {
    const srcRow = db.select().from(repoSources).where(eq(repoSources.id, repoId)).get() as any;
    if (srcRow) {
      for (const r of results) r.repoName = srcRow.name;
    }
  } catch { /* ignore */ }

  return results;
}

function buildSearchQueries(question: string): string[] {
  const q = question.trim();
  const queries: string[] = [q];
  const tokens = tokenize(q);
  queries.push(...tokens);
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, tokens.length); j++) {
      queries.push(tokens[i] + ' ' + tokens[j]);
    }
  }
  return [...new Set(queries)];
}

function detectRepoHint(question: string): string | null {
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

interface RawSearchResult {
  docType: string;
  docId: string;
  title: string;
  content?: string;
  repoName?: string;
  relPath?: string;
  repoId?: number;
}

interface ScoredSource {
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

function rawSearch(query: string): RawSearchResult[] {
  const results: RawSearchResult[] = [];
  const seen = new Map<string, number>();
  const pattern = `%${query}%`;

  // 1) search_fts
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
  } catch (err) { console.error('[ai.ask] rawSearch fts error:', err); }

  // 2) repo_documents — full content query
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
  } catch (err) { console.error('[ai.ask] rawSearch repo error:', err); }

  return results;
}

function rerankAndSelect(docs: RawSearchResult[], question: string, repoHint: string | null): ScoredSource[] {
  const keywords = tokenize(question.toLowerCase());

  // Expand keywords: include core English terms directly
  const coreTerms = keywords.filter(k => k.length >= 3);
  // Also add original question tokens as-is
  const allTerms = [...new Set([
    ...coreTerms,
    ...question.toLowerCase().split(/\s+/).filter(t => t.length >= 2),
  ])];

  // Helper: check if text includes any term (case-insensitive)
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

    // +100: title exact match (any term)
    if (allTerms.some(t => tLower === t)) score += 100;

    // +80: title contains core terms
    if (matchesAny(tLower, coreTerms)) score += 80;

    // +80: repoName matches repoHint
    if (repoHint && repoName.toLowerCase() === repoHint) score += 80;

    // +60: rel_path matches keywords
    if (matchesAny(relPath, coreTerms)) score += 60;

    // +40: content contains keywords (in first 5000 chars)
    const contentPreview = content.slice(0, 5000);
    if (matchesAny(contentPreview, coreTerms)) score += 40;

    // +10: github_md type (prefer markdown docs)
    if (doc.docType === 'github_md') score += 10;

    // -30: generic/empty titles
    if (/^无标题$|^Untitled$|^未命名$|^no title$/i.test(title) || title.length < 4) score -= 30;

    // +5: title has high-relevance words
    const highRelevance = ['sharpe', 'fitness', 'alpha', 'turnover', 'neutral', 'submission', 'comp1521', 'syscall', 'mips', '教会, 教程, 讲义', '作业', '周报', '日报'];
    if (matchesAny(tLower, highRelevance)) score += 5;

    // Build url for github_md
    let url = '/repos';
    if (doc.docType === 'github_md' && doc.repoId) {
      url = `/repos?repoId=${doc.repoId}&docId=${doc.docId}`;
    } else if (doc.docType === 'note') {
      url = `/notes/${doc.docId}`;
    } else if (doc.docType === 'memo') {
      url = '/memos';
    } else if (doc.docType === 'daily') {
      url = `/daily/${doc.docId}`;
    }

    return {
      docType: doc.docType,
      docId: doc.docId,
      repoId: doc.repoId || null,
      repoName,
      title,
      relPath,
      content,
      score,
      url,
      _rawContent: content,
    };
  });

  // Sort: primary by score desc, secondary by content length desc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b._rawContent.length || 0) - (a._rawContent.length || 0);
  });

  return scored.slice(0, TOP_K);
}

function buildContextAndSources(docs: ScoredSource[]): { prompt: string; sources: any[] } {
  // Upgrade content for github_md docs that have short content
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
    if (doc.docType === 'github_md') {
      label = `【${doc.repoName || '知识库'}】${doc.title}`;
    } else if (doc.docType === 'note') {
      label = `【笔记】${doc.title}`;
    } else if (doc.docType === 'memo') {
      label = `【备忘录】${doc.title}`;
    } else if (doc.docType === 'daily') {
      label = `【日报】${doc.title}`;
    }

    const excerpt = truncate(doc.content || '', MAX_DOC_CHARS);
    const block = `${label}\n${excerpt}\n`;
    if (totalLen + block.length > MAX_TOTAL_CHARS && totalLen > 0) break;
    contextParts.push(block);
    totalLen += block.length;

    sources.push({
      docType: doc.docType,
      docId: doc.docId,
      repoId: doc.repoId,
      repoName: doc.repoName,
      title: doc.title,
      relPath: doc.relPath,
      score: doc.score,
      url: doc.url,
      excerpt: excerpt.slice(0, 500),
    });
  }

  return { prompt: `### 知识库上下文\n${contextParts.join('\n')}`, sources };
}

// ─── Repo Meta Query Detection ─────────────────────────────────────────────────

interface RepoMetaResult {
  detected: boolean;
  repoName: string | null;
  reason: string;
}

/**
 * 检测问题是否为「知识库元信息查询」
 * 例如："知识库里面有 summary-for-work 吗？"
 *       "worldquant 有哪些内容？"
 *       "teach 同步了吗？"
 */
function detectRepoMetaQuery(question: string): RepoMetaResult {
  const q = question.trim();

  // 已知仓库名列表
  const knownRepos = ['summary-for-work', 'worldquant', 'teach'];

  // Pattern 1: 直接提到 repo 名称的元查询
  for (const repo of knownRepos) {
    // 匹配：知识库里面有 xxx 吗 / xxx 有哪些内容 / xxx 同步了吗 / xxx 里面有什么
    const metaPatterns = [
      // "知识库里面有/有没有/有 xxx 吗/内容" — 中间可能有空格或标点
      new RegExp(`知识库\\s*(里\\s*面\\s*有|里\\s*有|有没有|有|包含)\\s*.*${repo}`, 'i'),
      new RegExp(`知识库\\s*里?\\s*面?\\s*(有|包含)\\s*${repo}`, 'i'),
      // "xxx 有哪些内容/有什么/同步了"
      new RegExp(`${repo}\\s*(有\\s*哪\\s*些|有哪些|有什么|里面有什么|同步了|同步|包含了|内容)`, 'i'),
      // 单独 repo 名提问
      new RegExp(`^${repo}\\s*[？?]?$`, 'i'),
    ];
    for (const p of metaPatterns) {
      if (p.test(q)) {
        return { detected: true, repoName: repo, reason: `repo-meta:${p.source.slice(0, 40)}` };
      }
    }
    // 直接问 repo 名称
    if (new RegExp(`^${repo}\\s*[？?]$`).test(q)) {
      return { detected: true, repoName: repo, reason: `repo-name-query:${repo}` };
    }
  }

  // Pattern 2: 泛化元查询关键词
  const metaKeywords = ['知识库\\s*(里|里面|有|有没有)', '同步了', '有哪些内容', '有哪', '有什么'];
  for (const kw of metaKeywords) {
    for (const repo of knownRepos) {
      if (new RegExp(`${kw}.*${repo}`, 'i').test(q) ||
          new RegExp(`${repo}.*${kw.replace(/\\s/g, '')}`, 'i').test(q)) {
        return { detected: true, repoName: repo, reason: `keyword-match:${kw.slice(0, 15)}:${repo}` };
      }
    }
  }

  return { detected: false, repoName: null, reason: '' };
}

interface RepoMetaInfo {
  id: number;
  name: string;
  url: string;
  localPath: string;
  lastSyncAt: string | null;
  docCount: number;
  recentTitles: string[];
}

/**
 * 查询仓库元信息：doc 数量、示例标题
 */
/**
 * 查询仓库元信息：doc 数量、示例标题
 * 使用 raw sqlite（bypasses drizzle ORM quirks）以确保可靠
 */
function getRepoMetaInfo(repoName: string): RepoMetaInfo | null {
  try {
    // Use direct sqlite (exported from db/index.ts)
    const rawSqlite: any = sqlite;
    if (!rawSqlite?.prepare) return null;

    // Query repo by name
    const srcRow = rawSqlite
      .prepare('SELECT id, name, url, local_path, last_sync_at FROM repo_sources WHERE name = ?')
      .get(repoName) as any;
    if (!srcRow) return null;

    // Count docs
    const countRow = rawSqlite
      .prepare('SELECT COUNT(*) as cnt FROM repo_documents WHERE repo_id = ?')
      .get(srcRow.id) as any;
    const docCount = countRow?.cnt || 0;

    // Get recent titles
    const recentTitles: string[] = [];
    try {
      const titleRows = rawSqlite
        .prepare('SELECT title FROM repo_documents WHERE repo_id = ? ORDER BY updated_at DESC LIMIT 10')
        .all(srcRow.id) as any[];
      for (const t of titleRows) recentTitles.push((t.title || '').trim() || '无标题');
    } catch (_e) {}

    return {
      id: srcRow.id,
      name: srcRow.name,
      url: srcRow.url,
      localPath: srcRow.local_path || '',
      lastSyncAt: srcRow.last_sync_at || null,
      docCount,
      recentTitles,
    };
  } catch (_e) {
    return null;
  }
}

function formatRepoAnswer(meta: RepoMetaInfo): { answer: string; sources: any[] } {
  const lastSync = meta.lastSyncAt
    ? new Date(meta.lastSyncAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    : '从未同步';

  const answer = [
    `✅ 有的，${meta.name} 已经在知识库中。`,
    ``,
    `**仓库信息：**`,
    `- 文档数量：${meta.docCount} 篇 Markdown 文档`,
    `- 最近同步时间：${lastSync}`,
    ``,
    `**部分文档标题示例：**`,
    ...meta.recentTitles.slice(0, 5).map((t, i) => `${i + 1}. ${t}`),
    ``,
    `你可以点击下方的「参考来源」进入仓库查看全部文档。`,
  ].join('\n');

  const sources = [{
    docType: 'repo',
    repoId: meta.id,
    repoName: meta.name,
    title: `${meta.name}（${meta.docCount} 篇文档）`,
    url: `/repos?repoId=${meta.id}`,
    excerpt: `${meta.name} 已同步 ${meta.docCount} 篇文档，最近同步于 ${lastSync}`,
  }];

  return { answer, sources };
}

function handleRepoMetaQuery(question: string): { answer: string; sources: any[]; usedKnowledgeBase: boolean } | null {
  const meta = detectRepoMetaQuery(question);
  if (!meta.detected || !meta.repoName) return null;

  const info = getRepoMetaInfo(meta.repoName);
  if (!info) {
    // Repo 存在但 docCount=0 也走通用 FTS
    if (info === null && !['summary-for-work', 'worldquant', 'teach'].includes(meta.repoName)) {
      return null;
    }
    // Repo 确实不存在（非已知名），给出明确回复，不再走 FTS
    return {
      answer: `❌ 知识库中没有名为 **${meta.repoName}** 的仓库。\n\n目前已同步的仓库有：summary-for-work、worldquant、teach。你可以问我这些仓库的内容。`,
      sources: [],
      usedKnowledgeBase: false,
    };
  }

  const { answer, sources } = formatRepoAnswer(info);
  return { answer, sources, usedKnowledgeBase: true };
}

// ─── Step 0 NEW: Global Wiki Concept Exact Match ─────────────────────────────────

interface GlobalWikiMatch {
  page: any;       // wiki_pages row
  spaceId: number;
  spaceName: string;
  matchedTerm: string;   // the term that matched
}

// WQ concept alias map: normalized form → canonical slug
// Handles: "self-correlation" / "self correlation" / "selfcorrelation" → "self-correlation"
const WQ_CONCEPT_ALIAS: Record<string, string> = {
  // aliases → canonical slug
  'fitness': 'fitness',
  'selfcorrelation': 'self-correlation',
  'self-correlation': 'self-correlation',
  'self correlation': 'self-correlation',
  'sharpe': 'sharpe',
  'sharpe ratio': 'sharpe',
  'turnover': 'turnover',
  'returns': 'returns',
  'margin': 'margin',
  'drawdown': 'drawdown',
  'delay': 'delay',
  'decay': 'decay',
  'neutralization': 'neutralization',
  'truncation': 'truncation',
  'pasteurization': 'pasteurization',
  'universe': 'universe',
  'region': 'region',
  'submission': 'submission',
  'simulation': 'simulation',
  'correlation': 'correlation',
  'alpha': 'alpha',
  'beta': 'beta',
  'volatility': 'volatility',
  'exposure': 'exposure',
  'leverage': 'leverage',
};

/**
 * Normalize a search token:
 * - lowercase
 * - strip Chinese/English punctuation and spaces
 */
function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[？\?。，、！？．。，\.,!！\?\[\]\(\)\-'\"''""【】]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Extract all meaningful English tokens from a question.
 * Returns lowercase tokens to normalize mixed-case input like "Fitness".
 */
function extractEnglishTokens(question: string): string[] {
  const tokens: string[] = [];
  // Match English words (including capitalized ones like "Fitness")
  const englishPattern = /[a-zA-Z][a-zA-Z0-9-]{2,}/g;
  let match;
  while ((match = englishPattern.exec(question)) !== null) {
    const t = match[0].toLowerCase();
    if (!['the', 'and', 'for', 'with', 'what', 'how', 'when', 'where', 'why', 'which', 'from', 'that', 'this', 'are', 'you', 'your'].includes(t)) {
      tokens.push(t);
    }
  }
  return [...new Set(tokens)];
}

/**
 * Attempt to match a question against all wiki pages globally.
 * Does NOT require repo name in the question.
 *
 * Returns a GlobalWikiMatch if a unique best match is found, null otherwise.
 */
function matchGlobalWikiConcept(question: string): GlobalWikiMatch | null {
  try {
    const spaceRows = db.select({ id: wikiSpaces.id, name: wikiSpaces.name }).from(wikiSpaces).all() as any[];
    const spaceMap = new Map<number, string>();
    for (const s of spaceRows) spaceMap.set(s.id, s.name);

    // Get all wiki pages across all spaces (use raw sqlite for reliability)
    const rawSqlite: any = sqlite;
    const allPages = rawSqlite
      .prepare(`SELECT wp.id, wp.space_id, wp.title, wp.slug, wp.content, wp.confidence
                FROM wiki_pages wp
                ORDER BY wp.confidence DESC, wp.id ASC`)
      .all() as any[];

    // Build lookup maps: title-lowercase → page, slug-lowercase → page
    const byTitle = new Map<string, any>();
    const bySlug = new Map<string, any>();
    const candidates: any[] = [];

    for (const page of allPages) {
      const titleKey = (page.title || '').toLowerCase();
      const slugKey = (page.slug || '').toLowerCase();
      if (titleKey) byTitle.set(titleKey, page);
      if (slugKey && slugKey !== titleKey) bySlug.set(slugKey, page);
      candidates.push({ page, titleKey, slugKey });
    }

    // 1. Try direct slug match from alias map
    const englishTokens = extractEnglishTokens(question);
    for (const token of englishTokens) {
      const norm = normalizeTerm(token);
      // Check alias map first
      const canonicalSlug = WQ_CONCEPT_ALIAS[norm] || WQ_CONCEPT_ALIAS[token] || WQ_CONCEPT_ALIAS[norm.replace(/-/g, '')];
      if (canonicalSlug && bySlug.has(canonicalSlug)) {
        const page = bySlug.get(canonicalSlug)!;
        return {
          page,
          spaceId: page.space_id,
          spaceName: spaceMap.get(page.space_id) || '',
          matchedTerm: token,
        };
      }
      // Direct slug match (handles "fitness", "sharpe", etc.)
      if (bySlug.has(norm)) {
        const page = bySlug.get(norm)!;
        return {
          page,
          spaceId: page.space_id,
          spaceName: spaceMap.get(page.space_id) || '',
          matchedTerm: token,
        };
      }
    }

    // 2. Try normalized title match for each extracted token
    for (const token of englishTokens) {
      const norm = normalizeTerm(token);
      if (byTitle.has(norm)) {
        const page = byTitle.get(norm)!;
        return {
          page,
          spaceId: page.space_id,
          spaceName: spaceMap.get(page.space_id) || '',
          matchedTerm: token,
        };
      }
      // Also try without hyphens for title match
      const normNoHyphen = norm.replace(/-/g, '');
      for (const [titleKey, page] of byTitle) {
        if (titleKey === normNoHyphen || titleKey.replace(/-/g, '') === normNoHyphen) {
          return {
            page,
            spaceId: page.space_id,
            spaceName: spaceMap.get(page.space_id) || '',
            matchedTerm: token,
          };
        }
      }
    }

    // 3. Try extracting a "word phrase" from the question:
    // Match sequences like "word" or "word-word" that appear as-is in slug
    const slugPattern = /[a-z][a-z0-9-]{2,}/g;
    let slugMatch;
    while ((slugMatch = slugPattern.exec(question)) !== null) {
      const phrase = slugMatch[0];
      const normPhrase = normalizeTerm(phrase);
      // Check alias map
      const canonicalSlug = WQ_CONCEPT_ALIAS[normPhrase];
      if (canonicalSlug && bySlug.has(canonicalSlug)) {
        const page = bySlug.get(canonicalSlug)!;
        return {
          page,
          spaceId: page.space_id,
          spaceName: spaceMap.get(page.space_id) || '',
          matchedTerm: phrase,
        };
      }
      if (bySlug.has(normPhrase)) {
        const page = bySlug.get(normPhrase)!;
        return {
          page,
          spaceId: page.space_id,
          spaceName: spaceMap.get(page.space_id) || '',
          matchedTerm: phrase,
        };
      }
    }

    return null;
  } catch (err) {
    console.error('[ai.ask] matchGlobalWikiConcept error:', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  let question = '';
  try {
    const body = await req.json();
    question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return NextResponse.json({ error: 'question 是必填项' }, { status: 400 });
  } catch { return NextResponse.json({ error: '无效的请求体' }, { status: 400 }); }

  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  const aiApiKey = (process.env.AI_API_KEY || '').trim();
  const aiModel = (process.env.AI_MODEL || '').trim();

  if (!aiBaseUrl || !aiApiKey || !aiModel) {
    return NextResponse.json({ configured: false, error: 'AI 未配置' });
  }

  initDb();

  // ── Step 0: Repo 元信息查询（最高优先级，不走 FTS）──────────────
  const repoMetaResult = handleRepoMetaQuery(question);
  if (repoMetaResult) {
    return NextResponse.json({
      configured: true,
      answer: repoMetaResult.answer,
      sources: repoMetaResult.sources,
      usedKnowledgeBase: repoMetaResult.usedKnowledgeBase,
    });
  }
  // ────────────────────────────────────────────────────────────────

  // ── Step 0 NEW: 全局 Wiki 精确命中（不依赖 repoName）──────────────
  // 命中后不直接返回 page.content，而是把 wiki 内容作为上下文 → 调 AI 回答用户问题。
  // wikiContextParts/wikiSources 在这里声明，被 Step 0 / Step 0.5 共同填充，
  // 在 Step 0.5 之后统一交给 AI。无论是否为定义型问题都走 AI，让 AI 处理主观/
  // 推荐类问题（如"印象最深刻的alpha"），而不是直接复述 wiki 定义。
  const wikiContextParts: string[] = [];
  const wikiSources: any[] = [];
  let globalWikiMatch: { page: any; spaceId: number; spaceName: string; matchedTerm: string } | null = null;
  {
    const route = matchGlobalWikiConcept(question);
    if (route) {
      console.log('[ai.ask] wiki_exact matched:', route.matchedTerm, '→ pageId:', route.page.id);
      globalWikiMatch = route;
      wikiContextParts.push(
        `### Wiki 概念页: ${route.page.title} (confidence=${route.page.confidence || 'high'})\n${route.page.content}`
      );
      wikiSources.push({
        docType: 'wiki_page',
        docId: String(route.page.id),
        title: route.page.title,
        repoName: route.spaceName,
        url: `/wiki?spaceId=${route.spaceId}&pageId=${route.page.id}`,
        excerpt: String(route.page.content || '').slice(0, 300),
        confidence: route.page.confidence || 'high',
      });
    }
  }
  // ────────────────────────────────────────────────────────────────

  // ── Step 0.5: Wiki 知识层命中检测（仅 worldquant/WQ 概念）─────────
  // wiki 命中后不直接返回定义页，而是把 wiki 内容作为上下文 + 补充 repo_documents
  // 搜索 → 调 AI 生成回答，让 AI 真正回答用户的问题（而不是复述定义）。
  const wqConcept = detectWorldQuantConcept(question);
  let wqSpaceId: number | null = null;

  if (wqConcept.detected) {
    console.log('[ai.ask] WQ concept detected:', wqConcept.concepts);
    try {
      wqSpaceId = getOrCreateSpace('worldquant');
      const wikiHits = searchWikiPages(wqSpaceId, wqConcept.searchTerms);
      console.log('[ai.ask] wikiHits count:', wikiHits.length);

      // 收集 wiki 上下文（top 3），不直接返回
      for (const hit of wikiHits.slice(0, 3)) {
        const page = db.select().from(wikiPages).where(eq(wikiPages.id, hit.id)).get() as any;
        if (page) {
          wikiContextParts.push(
            `### Wiki 概念页: ${page.title} (confidence=${page.confidence})\n${page.content}`
          );
          wikiSources.push({
            docType: 'wiki_page',
            docId: String(page.id),
            title: page.title,
            repoName: 'worldquant',
            url: `/wiki?spaceId=${wqSpaceId}&pageId=${page.id}`,
            excerpt: page.summary || String(page.content || '').slice(0, 200),
            confidence: page.confidence,
          });
        }
      }
    } catch (err) {
      console.error('[ai.ask] wiki detection failed:', err);
    }
  }

  // 有 wiki 上下文 → 调 AI 回答用户问题（而不是复述 wiki 定义）
  if (wikiContextParts.length > 0) {
    // 补充 repo_documents 搜索，获取 wiki 没覆盖的细节
    const repoContextParts: string[] = [];
    const repoSourcesList: any[] = [];
    try {
      const srcRow = db.select().from(repoSources).all().find((r: any) => r.name === 'worldquant') as any;
      if (srcRow) {
        // 优先用 WQ 同义词；若仅 Step 0 全局命中，则用 matchedTerm + 问题 token
        const searchTerms = wqConcept.detected && wqConcept.searchTerms.length > 0
          ? wqConcept.searchTerms
          : (globalWikiMatch ? [globalWikiMatch.matchedTerm, ...tokenize(question)] : tokenize(question));
        const repoResults = rawSearchInRepo(srcRow.id, searchTerms);
        if (repoResults.length > 0) {
          const scoredRepoDocs = rerankAndSelect(repoResults, question, 'worldquant').slice(0, 3);
          if (scoredRepoDocs.length > 0) {
            const built = buildContextAndSources(scoredRepoDocs);
            repoContextParts.push(built.prompt);
            repoSourcesList.push(...built.sources);
          }
        }
      }
    } catch (err) {
      console.error('[ai.ask] wiki+repo supplementary search failed:', err);
    }

    const allContext = [...wikiContextParts, ...repoContextParts].join('\n\n');
    // 合并 sources，去重（wiki_page + github_md）
    const seenSrcKey = new Set<string>();
    const allSources: any[] = [];
    for (const s of [...wikiSources, ...repoSourcesList]) {
      const key = `${s.docType}::${s.docId || s.title}`;
      if (seenSrcKey.has(key)) continue;
      seenSrcKey.add(key);
      allSources.push(s);
    }

    const systemPrompt = `你是一个知识库问答助手。根据提供的「Wiki 概念页 + 知识库文档」上下文回答用户问题。

**回答规则：**
1. 基于上下文中的内容回答用户的具体问题，**不要简单复述定义**
2. 如果问题是主观性/总结性的（如"印象最深刻"、"最重要的"、"最常用"），结合知识库内容给出有针对性的回答，而不是罗列定义
3. 如果上下文和问题不完全匹配，诚实说明"我没有找到精确匹配的内容，以下基于相近信息回答"，然后基于你的通用知识给出完整有用答案
4. 优先引用标题最相关的来源，在回答中说明来自哪个来源（如"根据《XXX》..."）
5. 不要被不相关 sources 带偏，只使用与问题语义最相关的内容
6. 用中文回答，条理清晰，适当分段
7. **最关键**：如果所有 sources 都与问题无关或知识库内容很少/不相关，**完全基于你的通用知识**给出完整有用的回答，不要说"无法回答"、不要拒绝回答`;

    const userPrompt = `${allContext}

用户问题：${question}`;

    let answer = '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: aiModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`AI API error: ${res.status}`);
      const data = await res.json();
      answer = data.choices?.[0]?.message?.content || 'AI 返回为空';
    } catch (err: any) {
      if (err.name === 'AbortError') return NextResponse.json({ configured: true, sources: allSources, error: 'AI 请求超时（120s）', usedKnowledgeBase: true });
      return NextResponse.json({ configured: true, sources: allSources, error: `AI 请求失败: ${err.message}`, usedKnowledgeBase: true });
    }

    return NextResponse.json({
      configured: true,
      sources: allSources,
      usedKnowledgeBase: true,
      answer,
      wikiHit: true,
    });
  }
  // ────────────────────────────────────────────────────────────────

  // ── Step 0.6: Project Brain 项目级问答 ──────────────────────────
  // 检测问题是否包含项目关键词（robin/selfie/tx/rx/efuse/fpga/...）
  // 命中后：project_wiki + code_symbol 都进入上下文 → 调 AI 生成回答
  // 注意：不是直接返回 wiki 内容，而是用 wiki/code 作为上下文让 AI 回答用户问题
  const projectHit = detectProjectContext(question);
  if (projectHit.detected) {
    console.log('[ai.ask] project context detected:', {
      repoName: projectHit.repoName,
      repoId: projectHit.repoId,
      terms: projectHit.terms,
    });

    let projectWikiHits: ProjectWikiMatch[] = [];
    let codeSymbolHits: CodeSymbolMatch[] = [];
    let ontologyEdges: OntologyContextEdge[] = [];
    let projectSpaceId: number | null = null;

    if (projectHit.repoId) {
      try {
        projectSpaceId = getOrCreateProjectSpace(projectHit.repoName!, projectHit.repoId);
      } catch (err) {
        console.error('[ai.ask] getOrCreateProjectSpace failed:', err);
      }

      if (projectSpaceId) {
        try {
          projectWikiHits = searchProjectWiki(
            projectSpaceId,
            projectHit.terms,
            // 优先匹配项目级页面类型
            ['project_overview', 'module_summary', 'feature_summary', 'config_summary', 'commit_summary']
          );
        } catch (err) {
          console.error('[ai.ask] searchProjectWiki failed:', err);
        }
      }

      try {
        codeSymbolHits = searchCodeSymbols(projectHit.repoId, projectHit.terms);
      } catch (err) {
        console.error('[ai.ask] searchCodeSymbols failed:', err);
      }

      // Ontology: 搜实体 → 取 1-hop 关系,作为「关系上下文」加进 AI prompt
      try {
        const entityHits = searchOntologyEntities(projectHit.repoId, projectHit.terms);
        if (entityHits.length > 0) {
          ontologyEdges = getOntologyContextEdges(
            entityHits.slice(0, 8).map((h) => h.entity.id),
            40
          );
        }
      } catch (err) {
        console.error('[ai.ask] ontology lookup failed:', err);
      }
    }

    console.log(
      '[ai.ask] projectWikiHits:', projectWikiHits.length,
      'codeSymbolHits:', codeSymbolHits.length,
      'ontologyEdges:', ontologyEdges.length
    );

    if (projectWikiHits.length > 0 || codeSymbolHits.length > 0 || ontologyEdges.length > 0) {
      // 构造项目上下文 + sources,调 AI 回答用户问题
      const contextParts: string[] = [];
      const sources: any[] = [];
      const seenSourceKey = new Set<string>();

      // 0) Ontology 关系上下文(优先,让 AI 知道实体之间的关系)
      if (ontologyEdges.length > 0) {
        const edgeLines = ontologyEdges.slice(0, 30).map((e) => {
          const conf = e.confidence === 'high' ? '' : e.confidence === 'medium' ? ' (中置信)' : ' (低置信)';
          return `- ${e.fromName} [${e.fromType}] --${e.relationType}--> ${e.toName} [${e.toType}]${conf}`;
        });
        contextParts.push(`### 项目本体关系\n${edgeLines.join('\n')}`);
      }

      // 1) project_wiki 命中
      for (const hit of projectWikiHits.slice(0, 3)) {
        const srcKey = `project_wiki:${hit.id}`;
        if (seenSourceKey.has(srcKey)) continue;
        seenSourceKey.add(srcKey);
        contextParts.push(
          `### 项目 Wiki: ${hit.title} (pageType=${hit.pageType}, confidence=${hit.confidence})\n${hit.content}`
        );
        sources.push({
          docType: 'project_wiki',
          docId: String(hit.id),
          pageType: hit.pageType,
          title: hit.title,
          repoName: projectHit.repoName,
          url: `/wiki?spaceId=${projectSpaceId}&pageId=${hit.id}`,
          excerpt: hit.summary || String(hit.content || '').slice(0, 200),
          confidence: hit.confidence,
        });
      }

      // 2) code_symbol 命中（每条最多 600 字片段）
      for (const hit of codeSymbolHits.slice(0, 6)) {
        const srcKey = `code:${hit.fileId}:${hit.symbolName || hit.relPath}`;
        if (seenSourceKey.has(srcKey)) continue;
        seenSourceKey.add(srcKey);
        const symDesc = hit.type === 'symbol'
          ? `${hit.symbolType} ${hit.symbolName}${hit.signature ? ' ' + hit.signature : ''} (lines ${hit.startLine}-${hit.endLine})`
          : `file ${hit.relPath}`;
        const lineParam = hit.startLine ? `&line=${hit.startLine}` : '';
        contextParts.push(
          `### 代码: ${hit.relPath}\n${symDesc}\n${hit.summary || ''}`.trim()
        );
        sources.push({
          docType: hit.type === 'symbol' ? 'code_symbol' : 'code_file',
          fileId: hit.fileId,
          relPath: hit.relPath,
          title: hit.type === 'symbol' ? `${hit.symbolName} (${hit.relPath})` : hit.relPath,
          symbolType: hit.symbolType,
          startLine: hit.startLine,
          endLine: hit.endLine,
          repoName: projectHit.repoName,
          repoId: projectHit.repoId,
          url: `/code?repoId=${projectHit.repoId}&fileId=${hit.fileId}${lineParam}`,
          excerpt: hit.signature || hit.summary || '',
        });
      }

      const systemPrompt = `你是一个项目知识库问答助手。根据提供的「项目本体关系 + 项目 Wiki + 代码符号」上下文回答用户问题。

**回答规则：**
1. 只基于上下文中的内容回答，不要编造文件路径/函数名/配置值/commit hash
2. 如果上下文和问题不完全匹配，明确说明"我没有在项目知识库中找到精确匹配，以下是相关信息："
3. 在回答中引用 sources 中的文件路径、函数名、commit hash，让用户能定位到来源
4. 如果涉及代码，明确说明在哪个文件、哪一行附近
5. 如果上下文中有「项目本体关系」(entity --relation--> entity)，沿关系推理回答（例如 Module implementedBy File → 该模块的实现文件；Module configuredBy Config → 该模块的相关配置）
6. 用中文回答，条理清晰，适当分段
7. 如果上下文完全无法回答问题，直接说"我没有在项目知识库中找到明确来源。"`;

      const userPrompt = `### 项目知识库上下文
${contextParts.join('\n\n')}

用户问题：${question}`;

      let answer = '';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        const res = await fetch(`${aiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: aiModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`AI API error: ${res.status}`);
        const data = await res.json();
        answer = data.choices?.[0]?.message?.content || 'AI 返回为空';
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return NextResponse.json({ configured: true, sources, error: 'AI 请求超时（120s）', usedKnowledgeBase: true });
        }
        return NextResponse.json({ configured: true, sources, error: `AI 请求失败: ${err.message}`, usedKnowledgeBase: true });
      }

      return NextResponse.json({
        configured: true,
        sources,
        usedKnowledgeBase: true,
        answer,
        route: 'project_brain',
        projectBrainHit: true,
        repoName: projectHit.repoName,
      });
    }

    // project context 检测到但 wiki/code 都未命中 → 继续走 Step 1，最后会写入 wiki_error_book
    console.log('[ai.ask] project context detected but no wiki/code hits, falling through to Step 1');
  }
  // ────────────────────────────────────────────────────────────────

  // ── Step 1: Repo 关键词查询（repo 名 + 概念关键词）──────────────
  // 例如 "worldquant里面什么是margin" → 限定 worldquant repo 搜索 margin
  const repoKwQuery = detectRepoKeywordQuery(question);
  if (repoKwQuery.detected && repoKwQuery.searchTerms.length > 0) {
    console.log('[ai.ask] repoKeywordQuery detected:', {
      repoName: repoKwQuery.repoName,
      repoId: repoKwQuery.repoId,
      keywords: repoKwQuery.keywords,
      searchTerms: repoKwQuery.searchTerms,
    });

    // 即使 repo 不在数据库里，也不能走通用 FTS 伪装成知识库事实
    if (!repoKwQuery.repoId) {
      console.log('[ai.ask] repo not found in database, using fallback');
    } else {
      const repoScopedResults = rawSearchInRepo(repoKwQuery.repoId, repoKwQuery.searchTerms);
      console.log('[ai.ask] repoScopedResults count:', repoScopedResults.length);

      if (repoScopedResults.length > 0) {
        // 命中：限定 repo 内有相关文档，走知识库回答
        const scoredDocs = rerankAndSelect(repoScopedResults, question, repoKwQuery.repoName);
        console.log('[ai.ask] repoScoped scoredDocs:', scoredDocs.map(s => ({ title: s.title.slice(0, 40), score: s.score })));

        if (scoredDocs.length > 0) {
          const { prompt, sources } = buildContextAndSources(scoredDocs);
          const systemPrompt = `你是一个知识库问答助手。根据提供的「知识库上下文」回答用户问题。

**回答规则：**
1. 只基于 sources 中的内容回答，不要编造信息
2. 如果 sources 和问题不完全匹配，诚实说明"我没有找到精确匹配的内容，以下基于相近信息回答"，然后基于你的通用知识给出完整有用答案
3. 优先引用标题最相关的来源，在回答中说明来自哪个来源（如"根据《XXX》..."）
4. 不要被不相关 sources 带偏，只使用与问题语义最相关的内容
5. 用中文回答，条理清晰，适当分段
6. **最关键**：如果所有 sources 都与问题无关或知识库内容很少/不相关，**完全基于你的通用知识**给出完整有用的回答，不要说"无法回答"、不要拒绝回答`;

          const userPrompt = `${prompt}\n\n用户问题：${question}`;
          let answer = '';
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000);
            const res = await fetch(`${aiBaseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: aiModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3 }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) throw new Error(`AI API error: ${res.status}`);
            const data = await res.json();
            answer = data.choices?.[0]?.message?.content || 'AI 返回为空';
          } catch (err: any) {
            if (err.name === 'AbortError') return NextResponse.json({ configured: true, sources, error: 'AI 请求超时（120s）' });
            return NextResponse.json({ configured: true, sources, error: `AI 请求失败: ${err.message}` });
          }
          return NextResponse.json({ configured: true, sources, usedKnowledgeBase: true, answer, route: 'repo_search' });
        }
      }
    }

    // 未命中：继续到下方通用 FTS fallback 路径
    // （不要 early return，让 scoredDocs=0 时走通用 AI 兜底）
  }
  // ────────────────────────────────────────────────────────────────

  const repoHint = detectRepoHint(question);
  const queries = buildSearchQueries(question);
  console.log('[ai.ask] question=', question);
  console.log('[ai.ask] repoHint=', repoHint);
  console.log('[ai.ask] queries=', queries);

  const seen = new Set<string>();
  const rawResults: RawSearchResult[] = [];
  for (const q of queries) {
    const rows = rawSearch(q);
    for (const row of rows) {
      const key = `${row.docType}:${row.docId}`;
      if (!seen.has(key)) { seen.add(key); rawResults.push(row); }
    }
  }
  console.log('[ai.ask] unique rawResults:', rawResults.length);

  const docsWithContent = rawResults.filter(d => (d.content || '').length > 50);
  console.log('[ai.ask] docsWithContent count:', docsWithContent.length);

  const scoredDocs = rerankAndSelect(docsWithContent, question, repoHint);
  console.log('[ai.ask] scoredDocs count:', scoredDocs.length);
  console.log('[ai.ask] rankedSources=', scoredDocs.map(s => ({ title: s.title.slice(0, 40), repoName: s.repoName, relPath: s.relPath, score: s.score })));

  if (scoredDocs.length === 0) {
    // 知识库未命中，但仍调用 AI 通用回答
    const systemPrompt = `你是一个知识库问答助手。如果知识库没有相关内容，请基于你的通用知识回答用户问题。

**回答规则：**
1. 先说明"未命中知识库，以下为通用 AI 回答"
2. 基于你的知识用中文清晰回答
3. 条理清晰，适当分段`;

    const userPrompt = `用户问题：${question}`;
    let answer = '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: aiModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`AI API error: ${res.status}`);
      const data = await res.json();
      answer = data.choices?.[0]?.message?.content || 'AI 返回为空';
    } catch (err: any) {
      if (err.name === 'AbortError') return NextResponse.json({ configured: true, sources: [], usedKnowledgeBase: false, answer: 'AI 请求超时（120s）' });
      return NextResponse.json({ configured: true, sources: [], usedKnowledgeBase: false, answer: `AI 请求失败: ${err.message}` });
    }
    return NextResponse.json({ configured: true, sources: [], usedKnowledgeBase: false, answer, route: 'fallback' });
  }

  const { prompt, sources } = buildContextAndSources(scoredDocs);
    console.log('[ai.ask] final sources count:', sources.length);

  const systemPrompt = `你是一个知识库问答助手。根据提供的「知识库上下文」回答用户问题。

**回答规则：**
1. 只基于 sources 中的内容回答，不要编造信息
2. 如果 sources 和问题不完全匹配，诚实说明"我没有找到精确匹配的内容，以下基于相近信息回答"，然后基于你的通用知识给出完整有用答案
3. 优先引用标题最相关的来源，在回答中说明来自哪个来源（如"根据《XXX》..."）
4. 不要被不相关 sources 带偏，只使用与问题语义最相关的内容
5. 用中文回答，条理清晰，适当分段
6. **最关键**：如果所有 sources 都与问题无关或知识库内容很少/不相关，**完全基于你的通用知识**给出完整有用的回答，不要说"无法回答"、不要拒绝回答`;

  const userPrompt = `${prompt}\n\n用户问题：${question}`;

  let answer = '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: aiModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`AI API error: ${res.status}`);
    const data = await res.json();
    answer = data.choices?.[0]?.message?.content || 'AI 返回为空';
  } catch (err: any) {
    if (err.name === 'AbortError') return NextResponse.json({ configured: true, sources, error: 'AI 请求超时（120s）' });
    return NextResponse.json({ configured: true, sources, error: `AI 请求失败: ${err.message}` });
  }

  return NextResponse.json({ configured: true, sources, usedKnowledgeBase: true, answer, route: 'repo_search' });
}