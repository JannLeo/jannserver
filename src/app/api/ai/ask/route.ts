// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db, sqlite, initDb } from '@/lib/db/index';
import { searchFts, repoDocuments, repoSources } from '@/lib/db/schema';
import { or, like } from 'drizzle-orm';
import { semanticSearch, type SemanticHit } from '@/lib/embeddings';

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

// ─── Helpers for the new semantic-search flow ─────────────────────────────────

/**
 * 统一 AI 调用：替换原本 5 处重复的 fetch 块。
 * 失败时返回 { answer: 错误信息, error }，让调用方决定如何返回。
 */
async function callAi(
  aiBaseUrl: string,
  aiApiKey: string,
  aiModel: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ answer: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`AI API error: ${res.status}`);
    const data = await res.json();
    return { answer: data.choices?.[0]?.message?.content || 'AI 返回为空' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { answer: 'AI 请求超时（120s）', error: 'timeout' };
    }
    return { answer: `AI 请求失败: ${err.message}`, error: err.message };
  }
}

/**
 * 把 semanticSearch 的 hits 转成 sources 数组（含 title / url / excerpt）。
 * 从 docId 反查 wiki_pages / repo_documents 表取标题。
 * docId 约定：
 *   - wiki_page → 'wiki:42'
 *   - repo_doc  → '3:docs/readme.md'
 *   - obsidian_note → 'obsidian:00-总览.md'
 */
async function buildSourcesFromSemanticHits(hits: SemanticHit[]): Promise<any[]> {
  const sources: any[] = [];
  const seen = new Set<string>();

  // 收集 docId 反查
  const wikiIds: number[] = [];
  const repoKeys: { repoId: number; relPath: string }[] = [];
  for (const h of hits) {
    if (h.docType === 'wiki_page') {
      const m = /^wiki:(\d+)$/.exec(h.docId);
      if (m) wikiIds.push(Number(m[1]));
    } else if (h.docType === 'repo_doc') {
      const m = /^(\d+):(.+)$/.exec(h.docId);
      if (m) repoKeys.push({ repoId: Number(m[1]), relPath: m[2] });
    }
  }

  // wiki_page → 反查 title / spaceId
  const wikiMap = new Map<number, any>();
  if (wikiIds.length > 0) {
    try {
      const rawSqlite: any = sqlite;
      const ids = wikiIds.join(',');
      const rows = rawSqlite
        .prepare(`SELECT id, space_id, title, summary, confidence FROM wiki_pages WHERE id IN (${ids})`)
        .all() as any[];
      for (const r of rows) wikiMap.set(r.id, r);
    } catch (err) {
      console.error('[ai.ask] buildSources wiki lookup failed:', err);
    }
  }

  // repo_doc → 反查 title / repoName
  const repoDocMap = new Map<string, any>();
  if (repoKeys.length > 0) {
    try {
      const rawSqlite: any = sqlite;
      for (const k of repoKeys) {
        const row = rawSqlite
          .prepare('SELECT id, title, repo_id FROM repo_documents WHERE repo_id = ? AND rel_path = ?')
          .get(k.repoId, k.relPath) as any;
        if (row) repoDocMap.set(`${k.repoId}:${k.relPath}`, row);
      }
    } catch (err) {
      console.error('[ai.ask] buildSources repo lookup failed:', err);
    }
  }

  for (const h of hits) {
    const key = `${h.docType}:${h.docId}:${h.chunkIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (h.docType === 'wiki_page') {
      const m = /^wiki:(\d+)$/.exec(h.docId);
      const pageId = m ? Number(m[1]) : 0;
      const meta = wikiMap.get(pageId);
      sources.push({
        docType: 'wiki_page',
        docId: String(pageId),
        title: meta?.title || h.docId,
        repoName: 'worldquant',
        url: `/wiki?spaceId=${meta?.space_id || ''}&pageId=${pageId}`,
        excerpt: meta?.summary || h.content.slice(0, 200),
        confidence: meta?.confidence || 'medium',
        score: h.score,
      });
    } else if (h.docType === 'repo_doc') {
      const meta = repoDocMap.get(h.docId);
      sources.push({
        docType: 'github_md',
        docId: String(meta?.id || ''),
        title: meta?.title || h.docId,
        repoName: '',
        relPath: h.docId.replace(/^\d+:/, ''),
        url: `/repos`,
        excerpt: h.content.slice(0, 200),
        score: h.score,
      });
    } else if (h.docType === 'obsidian_note') {
      const relPath = h.docId.replace(/^obsidian:/, '');
      sources.push({
        docType: 'obsidian_note',
        docId: h.docId,
        title: relPath,
        repoName: 'obsidian',
        url: `/obsidian`,
        excerpt: h.content.slice(0, 200),
        score: h.score,
      });
    }
  }

  return sources;
}

export async function POST(req: NextRequest) {
  let question = '';
  let repoNameFromBody: string | null = null;
  try {
    const body = await req.json();
    question = typeof body.question === 'string' ? body.question.trim() : '';
    repoNameFromBody = typeof body.repoName === 'string' ? body.repoName.trim() : null;
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

  // ── Step 0.5 NEW: 语义检索（embedding-based）──────────────────────
  // 用向量相似度检索 wiki_page / repo_doc / obsidian_note chunks，
  // 命中后把 chunks 作为上下文喂给 AI，让 AI 基于知识库回答（而不是复述定义）。
  // 语义检索覆盖了"用词不同但语义相近"的复杂问题。
  let semanticHits: SemanticHit[] = [];
  try {
    // 用较大 topK 避免 n-gram 对通用词的天然偏好导致目标 repo 文档落选
    // n-gram cosine 对 CS 课程 "fitness function" 天然高分（0.92+），WorldQuant 概念文档（~0.80）需加大候选集
    const SEARCH_TOP_K = 800;
    semanticHits = await semanticSearch(question, SEARCH_TOP_K, { minScore: 0.20 });
    console.log('[ai.ask] semanticSearch hits:', semanticHits.length,
      'top scores:', semanticHits.slice(0, 3).map(h => h.score.toFixed(3)));
  } catch (err) {
    console.error('[ai.ask] semanticSearch failed (will fall back to FTS):', err);
  }

  // Repo hint 加权：优先使用用户 UI 选择的 repo，其次用 detectRepoHint
  // 因为 n-gram embedding 对通用词（如 fitness）会匹配 CS 课程的 fitness function，
  // 而 WorldQuant 的 fitness 反而被压低，需要足够大的 boost 才能扭转排序
  const rh = repoNameFromBody ?? detectRepoHint(question);
  if (rh && semanticHits.length > 0) {
    for (const h of semanticHits) {
      let boost = 0;
      if (h.docType === 'obsidian_note') {
        const relPath = h.docId.replace(/^obsidian:/, '');
        if (relPath.startsWith(rh + '/') || relPath.startsWith(rh + '\\')) boost = 0.55;
      } else if (h.docType === 'repo_doc') {
        boost = 0.05;
      } else if (h.docType === 'wiki_page') {
        boost = 0.55;
      }
      h.score += boost;
    }
    semanticHits.sort((a, b) => b.score - a.score);
    semanticHits = semanticHits.slice(0, 8);
    console.log('[ai.ask] after repoHint boost:', rh,
      'top scores:', semanticHits.slice(0, 3).map(h => h.score.toFixed(3)));
  }

  if (semanticHits.length > 0) {
    // 无论是否 boost，只取 top 8（防止 800 条 context 撑爆 AI prompt）
    if (!rh) {
      semanticHits = semanticHits.slice(0, 8);
    }
    // 构造上下文：每条 hit 一段（docType/docId/score 标注）
    const contextParts: string[] = semanticHits.map((h, i) =>
      `[${i + 1}] docType=${h.docType} score=${h.score.toFixed(3)} docId=${h.docId}\n${h.content}`
    );

    // 构造 sources：从 docId 反查 title
    const sources = await buildSourcesFromSemanticHits(semanticHits);

    const systemPrompt = `你是一个知识库问答助手。根据提供的「知识库片段」上下文回答用户问题。

**回答规则：**
1. 基于上下文中的内容回答用户的具体问题，不要简单复述定义
2. 如果问题是主观性/总结性的（如"印象最深刻"、"最重要的"、"最常用"），结合知识库内容给出有针对性的回答，而不是罗列定义
3. 如果上下文和问题不完全匹配，诚实说明"未找到精确匹配，基于相近信息回答"，然后基于通用知识给出完整答案
4. 在回答中标注引用来源（如"根据《XXX》..."）
5. 用中文回答，条理清晰，适当分段
6. 如果所有上下文都与问题无关，完全基于你的通用知识回答，不要拒绝

**知识库片段（按相关度排序）：**
${contextParts.join('\n\n---\n\n')}`;

    const userPrompt = `用户问题：${question}`;

    const { answer, error } = await callAi(aiBaseUrl, aiApiKey, aiModel, systemPrompt, userPrompt);
    if (error) {
      return NextResponse.json({
        configured: true,
        sources,
        usedKnowledgeBase: true,
        answer,
        error,
        route: 'semantic',
      });
    }
    return NextResponse.json({
      configured: true,
      sources,
      usedKnowledgeBase: true,
      answer,
      route: 'semantic',
    });
  }
  // ────────────────────────────────────────────────────────────────

  const repoHint = repoNameFromBody ?? detectRepoHint(question);
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
    const { answer } = await callAi(aiBaseUrl, aiApiKey, aiModel, systemPrompt, userPrompt);
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
  const { answer } = await callAi(aiBaseUrl, aiApiKey, aiModel, systemPrompt, userPrompt);
  return NextResponse.json({ configured: true, sources, usedKnowledgeBase: true, answer, route: 'fts' });
}