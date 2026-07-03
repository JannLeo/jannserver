// @ts-nocheck
import { db, sqlite } from './db/index';
import {
  wikiSpaces,
  wikiPages,
  wikiLinks,
  wikiErrorBook,
  repoDocuments,
  repoSources,
  searchFts,
} from './db/schema';
import { eq, and, like, or } from 'drizzle-orm';
import { updateFts } from './search';

// ─── WorldQuant BRAIN 内建概念列表 ─────────────────────────────────────────
export const WQ_CONCEPTS = [
  { slug: 'alpha', title: 'Alpha', synonyms: ['alpha', 'Alpha', '阿尔法', '因子'] },
  { slug: 'fitness', title: 'Fitness', synonyms: ['fitness', 'Fitness', '适应度', '拟合度'] },
  { slug: 'sharpe', title: 'Sharpe', synonyms: ['sharpe', 'Sharpe', '夏普', '夏普比率'] },
  { slug: 'returns', title: 'Returns', synonyms: ['returns', 'Returns', '收益', '收益率'] },
  { slug: 'turnover', title: 'Turnover', synonyms: ['turnover', 'Turnover', '换手率', '换手'] },
  { slug: 'margin', title: 'Margin', synonyms: ['margin', 'Margin', '保证金', '边际', '收益效率'] },
  { slug: 'drawdown', title: 'Drawdown', synonyms: ['drawdown', 'Drawdown', '回撤'] },
  { slug: 'delay', title: 'Delay', synonyms: ['delay', 'Delay', '延迟', '延迟天数'] },
  { slug: 'decay', title: 'Decay', synonyms: ['decay', 'Decay', '衰减', '衰减期'] },
  { slug: 'neutralization', title: 'Neutralization', synonyms: ['neutralization', 'Neutralization', '中性化', '中性'] },
  { slug: 'truncation', title: 'Truncation', synonyms: ['truncation', 'Truncation', '截断'] },
  { slug: 'pasteurization', title: 'Pasteurization', synonyms: ['pasteurization', 'Pasteurization', '巴斯化', 'pasteurize'] },
  { slug: 'universe', title: 'Universe', synonyms: ['universe', 'Universe', '股票池', '标的池'] },
  { slug: 'region', title: 'Region', synonyms: ['region', 'Region', '区域', '市场'] },
  { slug: 'submission', title: 'Submission', synonyms: ['submission', 'Submission', '提交', '提交检查'] },
  { slug: 'simulation', title: 'Simulation', synonyms: ['simulation', 'Simulation', '模拟', '回测'] },
  { slug: 'correlation', title: 'Correlation', synonyms: ['correlation', 'Correlation', '相关性', '相关'] },
  { slug: 'self-correlation', title: 'Self-correlation', synonyms: ['self-correlation', 'self correlation', '自相关', '自相关性'] },
] as const;

const SYSTEM_PROMPT = `你是 WorldQuant BRAIN 知识库的 wiki 编译者。
基于提供的「repo 源文档片段」为指定概念生成结构化 wiki 页。

严格规则：
1. 只能依据源文档片段生成，不得编造数值/规则/示例
2. 若源文档信息不足以构成完整定义，confidence 必须为 'low'
3. source_refs 中每条必须映射回输入片段的 docId + relPath
4. content 必须用 markdown，包含以下小节：
   ## 定义
   ## BRAIN 平台上下文
   ## 计算或判定方式
   ## 关联概念
   ## 注意事项
5. 输出严格 JSON，字段：
   title(string), summary(string, <=120字), content(string, markdown),
   aliases(string[]), tags(string[]),
   source_refs([{docId, relPath, excerpt}]),
   confidence('high' | 'medium' | 'low')

不要输出 JSON 以外的文本。`;

export interface CompileResult {
  ok: boolean;
  pageId?: number;
  confidence?: string;
  reason?: string;
  alreadyExists?: boolean;
  sourceCount?: number;
  supportedConcepts?: string[];
}

/**
 * 列出所有支持的 concept slug（用于错误返回）
 */
export function listSupportedConceptSlugs(): string[] {
  return WQ_CONCEPTS.map((c) => c.slug);
}

/**
 * 规范化 concept 输入：trim + 大小写不敏感 + 支持别名
 * 返回匹配到的标准 slug，未匹配返回 null
 *
 * 例如以下输入都返回 'fitness'：
 *   'Fitness', 'FITNESS', 'fitness', '适应度', '拟合度'
 */
export function normalizeConcept(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const c of WQ_CONCEPTS) {
    if (c.slug === lower) return c.slug;
    for (const syn of c.synonyms) {
      if (syn === raw || syn.toLowerCase() === lower) return c.slug;
    }
  }
  return null;
}

/**
 * 获取或创建 wiki_space（按 repoName 关联 repo_sources）
 */
export function getOrCreateSpace(repoName: string): number {
  const repoRow = db.select().from(repoSources).all().find((r: any) => r.name === repoName) as any;
  const sourceId = repoRow?.id ?? null;

  const existing = db
    .select()
    .from(wikiSpaces)
    .where(
      sourceId
        ? and(eq(wikiSpaces.sourceType, 'repo'), eq(wikiSpaces.sourceId, sourceId))
        : eq(wikiSpaces.name, repoName)
    )
    .all() as any[];

  if (existing.length > 0) return existing[0].id;

  const now = new Date().toISOString();
  const result = db
    .insert(wikiSpaces)
    .values({
      name: repoName,
      sourceType: 'repo',
      sourceId,
      description: `Wiki space for ${repoName}`,
      createdAt: now,
      updatedAt: now,
    })
    .run() as any;
  return Number(result.lastInsertRowid);
}

interface SourceFragment {
  docId: number;
  relPath: string;
  excerpt: string;
}

/**
 * 在指定 repo 内搜索概念同义词，返回源文档片段
 */
function gatherSources(repoId: number, synonyms: readonly string[]): SourceFragment[] {
  const seen = new Map<string, SourceFragment>();
  for (const term of synonyms) {
    if (!term || term.length < 2) continue;
    const pattern = `%${term}%`;
    try {
      const rows = db
        .select({
          id: repoDocuments.id,
          title: repoDocuments.title,
          content: repoDocuments.content,
          relPath: repoDocuments.relPath,
        })
        .from(repoDocuments)
        .where(
          and(
            eq(repoDocuments.repoId, repoId),
            or(like(repoDocuments.title, pattern), like(repoDocuments.content, pattern))
          )
        )
        .limit(10)
        .all() as any[];
      for (const row of rows) {
        const key = String(row.relPath || row.id);
        if (seen.has(key)) continue;
        const content = String(row.content || '');
        // 截取包含关键词的片段，最多 1500 字
        const lower = content.toLowerCase();
        const idx = lower.indexOf(term.toLowerCase());
        const start = Math.max(0, idx - 200);
        const excerpt = content.slice(start, start + 1500);
        seen.set(key, {
          docId: row.id,
          relPath: String(row.relPath || ''),
          excerpt,
        });
      }
    } catch (err) {
      console.error('[wiki] gatherSources error for term', term, err);
    }
  }
  return Array.from(seen.values()).slice(0, 12);
}

/**
 * 容错 JSON 解析：直接 parse → 抽取 ```json``` 块 → 失败返回 null
 */
function parseAiJson(text: string): any | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  // 尝试抽取 ```json ... ``` 块
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }
  // 尝试抽取第一个 { 到最后一个 }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  return null;
}

/**
 * 编译单个概念的 wiki_page
 */
export async function compileConcept(opts: {
  repoName: string;
  slug: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
}): Promise<CompileResult> {
  const { repoName, aiBaseUrl, aiApiKey, aiModel } = opts;
  // 规范化 concept：支持大小写不敏感 + 中英文别名
  const normalizedSlug = normalizeConcept(opts.slug);
  if (!normalizedSlug) {
    return {
      ok: false,
      reason: `unknown concept: ${opts.slug}`,
      supportedConcepts: listSupportedConceptSlugs(),
    };
  }
  const slug = normalizedSlug;
  const entry = WQ_CONCEPTS.find((c) => c.slug === slug)!;

  const repoRow = db.select().from(repoSources).all().find((r: any) => r.name === repoName) as any;
  if (!repoRow) return { ok: false, reason: `repo not found: ${repoName}` };
  const repoId = repoRow.id;

  const spaceId = getOrCreateSpace(repoName);

  // 已存在且 confidence != 'low' → skip
  const existing = db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.spaceId, spaceId), eq(wikiPages.slug, slug)))
    .all() as any[];
  if (existing.length > 0 && existing[0].confidence !== 'low') {
    return { ok: true, alreadyExists: true, pageId: existing[0].id, confidence: existing[0].confidence };
  }

  // 收集源
  const sources = gatherSources(repoId, entry.synonyms);
  const sourceCount = sources.length;
  const forceLow = sourceCount < 2;

  // 构造源片段上下文
  const sourcesBlock = sources.length > 0
    ? sources.map((s, i) => `### 源文档 ${i + 1} (docId=${s.docId}, relPath=${s.relPath})\n${s.excerpt}`).join('\n\n')
    : '（未找到相关源文档片段）';

  const userPrompt = `请为概念「${entry.title}」(slug: ${slug}) 编译一份 wiki 页。

概念同义词：${entry.synonyms.join('、')}

## 源文档片段
${sourcesBlock}

请严格依据上述源文档片段生成 wiki 页 JSON。若源文档不足，confidence 必须为 'low'。`;

  // 调 AI
  let aiText = '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, reason: `AI API error: ${res.status}`, sourceCount };
    }
    const data = await res.json();
    aiText = data.choices?.[0]?.message?.content || '';
  } catch (err: any) {
    if (err.name === 'AbortError') return { ok: false, reason: 'AI 请求超时（120s）', sourceCount };
    return { ok: false, reason: `AI 请求失败: ${err.message}`, sourceCount };
  }

  if (!aiText.trim()) return { ok: false, reason: 'AI 返回为空', sourceCount };

  // 解析 JSON
  const parsed = parseAiJson(aiText);
  const now = new Date().toISOString();

  let title: string;
  let summary: string;
  let content: string;
  let aliasesJson: string;
  let tagsJson: string;
  let sourceRefsJson: string;
  let confidence: string;

  if (parsed) {
    title = String(parsed.title || entry.title);
    summary = String(parsed.summary || '');
    content = String(parsed.content || aiText);
    aliasesJson = JSON.stringify(Array.isArray(parsed.aliases) ? parsed.aliases : []);
    tagsJson = JSON.stringify(Array.isArray(parsed.tags) ? parsed.tags : []);
    sourceRefsJson = JSON.stringify(
      Array.isArray(parsed.source_refs)
        ? parsed.source_refs.map((r: any) => ({
            docId: r.docId ?? null,
            relPath: r.relPath ?? '',
            excerpt: String(r.excerpt || '').slice(0, 500),
          }))
        : sources.map((s) => ({ docId: s.docId, relPath: s.relPath, excerpt: s.excerpt.slice(0, 500) }))
    );
    confidence = forceLow ? 'low' : String(parsed.confidence || 'medium');
    if (!['high', 'medium', 'low'].includes(confidence)) confidence = 'medium';
  } else {
    // JSON 解析失败 → 把原文当 content，confidence=low
    title = entry.title;
    summary = '';
    content = aiText;
    aliasesJson = '[]';
    tagsJson = JSON.stringify([...entry.synonyms]);
    sourceRefsJson = JSON.stringify(
      sources.map((s) => ({ docId: s.docId, relPath: s.relPath, excerpt: s.excerpt.slice(0, 500) }))
    );
    confidence = 'low';
  }

  // upsert wiki_pages（先删同 space_id+slug，再 insert）
  if (existing.length > 0) {
    const oldPageId = existing[0].id;
    // 清理旧 search_fts 条目（docId 前缀 wiki:）
    try {
      db.delete(searchFts).where(eq(searchFts.docId, `wiki:${oldPageId}`)).run();
    } catch {}
    // 清理旧 wiki_links
    try {
      db.delete(wikiLinks).where(eq(wikiLinks.fromPageId, oldPageId)).run();
    } catch {}
    db.delete(wikiPages).where(eq(wikiPages.id, oldPageId)).run();
  }
  const insertResult = db
    .insert(wikiPages)
    .values({
      spaceId,
      slug,
      title,
      summary,
      content,
      aliasesJson,
      tagsJson,
      sourceRefsJson,
      confidence,
      createdAt: now,
      updatedAt: now,
    })
    .run() as any;
  const pageId = Number(insertResult.lastInsertRowid);

  // 写 search_fts（docId 用 wiki:{pageId} 前缀避免与其他文档类型冲突）
  try {
    await updateFts('wiki_page', `wiki:${pageId}`, title, summary + '\n' + content);
  } catch (err) {
    console.error('[wiki] updateFts failed:', err);
  }

  // 创建 wiki_links：从 content 中抽取概念名，匹配 WQ_CONCEPTS
  try {
    const lowerContent = content.toLowerCase();
    const linkEntries: { toSlug: string; linkText: string }[] = [];
    for (const c of WQ_CONCEPTS) {
      if (c.slug === slug) continue;
      for (const syn of c.synonyms) {
        if (lowerContent.includes(syn.toLowerCase())) {
          linkEntries.push({ toSlug: c.slug, linkText: c.title });
          break;
        }
      }
    }
    for (const link of linkEntries.slice(0, 15)) {
      // 查目标 page 是否已存在
      const toPage = db
        .select()
        .from(wikiPages)
        .where(and(eq(wikiPages.spaceId, spaceId), eq(wikiPages.slug, link.toSlug)))
        .all() as any[];
      const toPageId = toPage.length > 0 ? toPage[0].id : null;
      db.insert(wikiLinks)
        .values({
          spaceId,
          fromPageId: pageId,
          toPageId,
          linkText: link.linkText,
          relationType: 'related',
          createdAt: now,
        })
        .run();
    }
  } catch (err) {
    console.error('[wiki] createLinks failed:', err);
  }

  console.log(`[wiki] compiled ${slug}: confidence=${confidence}, sources=${sourceCount}, pageId=${pageId}`);
  return { ok: true, pageId, confidence, sourceCount };
}

export interface WikiPageMatch {
  id: number;
  spaceId: number;
  slug: string;
  title: string;
  summary: string;
  confidence: string;
  score: number;
}

/**
 * 在指定 space 内搜索 wiki_pages（按 title/aliases/content LIKE）
 */
export function searchWikiPages(spaceId: number, terms: string[]): WikiPageMatch[] {
  if (terms.length === 0) return [];
  const scored: WikiPageMatch[] = [];

  try {
    const allPages = db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.spaceId, spaceId))
      .all() as any[];

    for (const page of allPages) {
      let score = 0;
      const titleLower = String(page.title || '').toLowerCase();
      const summaryLower = String(page.summary || '').toLowerCase();
      const contentLower = String(page.content || '').toLowerCase();
      let aliases: string[] = [];
      try {
        aliases = JSON.parse(page.aliasesJson || '[]');
      } catch {}
      const aliasesLower = aliases.map((a: string) => String(a).toLowerCase());

      for (const term of terms) {
        const t = term.toLowerCase();
        if (!t || t.length < 2) continue;
        // +100: title 完全匹配
        if (titleLower === t) score += 100;
        // +60: aliases 完全匹配
        else if (aliasesLower.includes(t)) score += 60;
        // +50: title contains
        else if (titleLower.includes(t)) score += 50;
        // +40: aliases contains
        else if (aliasesLower.some((a: string) => a.includes(t))) score += 40;
        // +20: summary contains
        if (summaryLower.includes(t)) score += 20;
        // +10: content contains
        if (contentLower.includes(t)) score += 10;
      }

      if (score > 0) {
        scored.push({
          id: page.id,
          spaceId: page.spaceId,
          slug: page.slug,
          title: page.title,
          summary: page.summary,
          confidence: page.confidence,
          score,
        });
      }
    }
  } catch (err) {
    console.error('[wiki] searchWikiPages error:', err);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
}

/**
 * 记录 wiki_error_book
 */
export function recordWikiError(opts: {
  spaceId: number | null;
  question: string;
  failureType: string;
  missingConcept: string;
  notes?: string;
}): void {
  try {
    const now = new Date().toISOString();
    db.insert(wikiErrorBook)
      .values({
        spaceId: opts.spaceId,
        question: opts.question,
        failureType: opts.failureType,
        missingConcept: opts.missingConcept,
        notes: opts.notes || '',
        resolved: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (err) {
    console.error('[wiki] recordWikiError failed:', err);
  }
}
