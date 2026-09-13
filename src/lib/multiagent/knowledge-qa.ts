// @ts-nocheck
/**
 * 知识库问答 Multi-Agent DAG
 *
 * 架构：
 *   用户问题
 *      ↓
 *  [意图分类 Agent] ──► 判断问题类型
 *      ↓
 *  [查询改写 Agent]  ──► 优化搜索词
 *      ↓
 *  [并行执行：语义搜索 + FTS 搜索]
 *      ↓
 *  [答案生成 Agent]  ──► 最终回答
 *
 * 特点：
 * - 每个 Agent 职责单一，便于调试
 * - 语义搜索和 FTS 并行执行
 * - 可追溯每个节点的输出
 */

import { AgentNode, DagDefinition, executeDag, callLlm, getAiConfig } from './index';
import { executeSearch, type SearchResult } from './knowledge-search';
import type { RunContext } from './types';

// ─── 类型定义 ───────────────────────────────────────────────────────────────

export interface QaResult {
  answer: string;
  sources: any[];
  questionType: string;
  searchQueries: string[];
  repoHint: string | null;
  usedKnowledgeBase: boolean;
  dagOutputs: Record<string, any>;
  execution: {
    totalDurationMs: number;
    nodeResults: Record<string, any>;
  };
}

// ─── 问题类型定义 ───────────────────────────────────────────────────────────

type QuestionType =
  | 'concept_explanation'    // 概念解释
  | 'fact_lookup'            // 事实查找
  | 'howto_guide'            // 操作指南
  | 'comparison'             // 对比分析
  | 'repo_status'            // 仓库状态查询
  | 'general_chat';          // 闲聊

// ─── Agent 1: 意图分类 ─────────────────────────────────────────────────────

const classifyIntentNode: AgentNode = {
  id: 'classify_intent',
  name: '意图分类',
  deps: [],
  fn: async (_, ctx) => {
    const question: string = ctx.question;
    ctx.log('意图分类：分析问题类型...');

    const systemPrompt = `你是一个问题分类助手。请分析用户问题的意图，将其分类到以下类别之一：

- concept_explanation：概念解释（如"什么是 XXX"、"XXX 的原理"）
- fact_lookup：事实查找（如"XXX 在哪里"、"YYY 是什么时候"）
- howto_guide：操作指南（如"怎么实现 XXX"、"如何配置 YYY"）
- comparison：对比分析（如"XXX 和 YYY 有什么区别"）
- repo_status：仓库状态查询（如"知识库有 XXX 吗"、"YYY 同步了吗"）
- general_chat：闲聊或无法归类的问题

**输出格式（严格 JSON）：**
{"type": "类别名", "confidence": 0.0-1.0, "reasoning": "一句话说明为什么这么分类"}`;

    const result = await callLlm(systemPrompt, `用户问题：${question}`, { temperature: 0.1 });
    
    // 解析 JSON
    let classification = { type: 'general_chat' as QuestionType, confidence: 0.5, reasoning: '默认分类' };
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        classification = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      ctx.log(`意图分类 JSON 解析失败，使用默认分类`);
    }

    ctx.log(`意图分类结果：${classification.type}（置信度 ${classification.confidence}）`);
    return classification;
  },
  timeout: 30_000,
};

// ─── Agent 2: 查询改写 ─────────────────────────────────────────────────────

const rewriteQueryNode: AgentNode = {
  id: 'rewrite_query',
  name: '查询改写',
  deps: ['classify_intent'],
  fn: async (inputs, ctx) => {
    const { type } = inputs['classify_intent'];
    const question: string = ctx.question;

    // repo_status 类问题不走 RAG，直接返回
    if (type === 'repo_status') {
      return { rewrittenQueries: [], shouldSkipRag: true, reason: '仓库状态查询' };
    }

    const systemPrompt = `你是一个查询优化助手。请将用户问题改写成 1-3 个更适合搜索的查询词。

**规则：**
1. 保留原问题的核心意图
2. 将口语化表达转为搜索友好的关键词
3. 适当扩展同义词
4. 如果原问题已经很精准，保持不变

**输出格式（严格 JSON）：**
{"rewrittenQueries": ["查询1", "查询2"], "shouldSkipRag": false, "reasoning": "改写说明"}`;

    const result = await callLlm(systemPrompt, `原始问题：${question}`, { temperature: 0.2 });
    
    let parsed = { rewrittenQueries: [question], shouldSkipRag: false, reasoning: '' };
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parsed.rewrittenQueries) || parsed.rewrittenQueries.length === 0) {
          parsed.rewrittenQueries = [question];
        }
      }
    } catch (e) {
      parsed = { rewrittenQueries: [question], shouldSkipRag: false, reasoning: '默认使用原问题' };
    }

    return parsed;
  },
  timeout: 30_000,
};

// ─── Agent 3: 语义搜索（并行节点）────────────────────────────────────────────

const semanticSearchNode: AgentNode = {
  id: 'semantic_search',
  name: '语义搜索',
  deps: ['rewrite_query'],
  fn: async (inputs, ctx) => {
    const rewrite = inputs['rewrite_query'];
    if (rewrite.shouldSkipRag) {
      return { hits: [], skipped: true, reason: rewrite.reason };
    }

    const question: string = ctx.question;
    const repoName: string | null = ctx.repoName || null;

    // 使用查询改写后的第一个查询词进行语义搜索
    const searchQuery = rewrite.rewrittenQueries?.[0] || question;

    const result = await executeSearch(searchQuery, repoName, { topK: 800 });

    return {
      hits: result.semanticHits,
      topSemHits: result.topSemHits,
      searchContext: result.searchContext,
      sources: result.sources,
      searchQuery,
      repoHint: result.repoHint,
      hitCount: result.semanticHits.length,
    };
  },
  timeout: 60_000,
};

// ─── Agent 4: FTS 搜索（并行节点）────────────────────────────────────────────

const ftsSearchNode: AgentNode = {
  id: 'fts_search',
  name: 'FTS 全文搜索',
  deps: ['rewrite_query'],
  fn: async (inputs, ctx) => {
    const rewrite = inputs['rewrite_query'];
    if (rewrite.shouldSkipRag) {
      return { results: [], skipped: true, reason: rewrite.reason };
    }

    const question: string = ctx.question;
    const repoHint: string | null = ctx.repoHint || null;

    // 导入 FTS 函数
    const { buildSearchQueries, rawSearch, rerankAndSelect, buildContextAndSources } = await import('./knowledge-search');

    const queries = buildSearchQueries(question);
    const seen = new Set<string>();
    const rawResults: any[] = [];

    for (const q of queries.slice(0, 10)) {
      const rows = rawSearch(q);
      for (const row of rows) {
        const key = `${row.docType}:${row.docId}`;
        if (!seen.has(key)) { seen.add(key); rawResults.push(row); }
      }
    }

    const docsWithContent = rawResults.filter(d => (d.content || '').length > 50);
    const scored = rerankAndSelect(docsWithContent, question, repoHint);
    const { prompt, sources } = buildContextAndSources(scored);

    return {
      results: scored,
      searchContext: prompt,
      sources,
      queryCount: queries.length,
      resultCount: scored.length,
    };
  },
  timeout: 60_000,
};

// ─── Agent 5: 答案生成 ──────────────────────────────────────────────────────

const generateAnswerNode: AgentNode = {
  id: 'generate_answer',
  name: '答案生成',
  deps: ['classify_intent', 'semantic_search', 'fts_search'],
  fn: async (inputs, ctx) => {
    const question: string = ctx.question;
    const intent = inputs['classify_intent'];
    const semSearch = inputs['semantic_search'];
    const ftsSearch = inputs['fts_search'];

    // repo_status 特殊处理
    if (intent.type === 'repo_status') {
      return {
        answer: '这是一个关于知识库状态的查询，请使用知识库的元信息查询功能。',
        usedKnowledgeBase: false,
      };
    }

    // 合并搜索结果
    let searchContext = '';
    const allSources: any[] = [];
    
    if (semSearch?.searchContext && !semSearch.skipped) {
      searchContext += `## 语义搜索结果（${semSearch.hitCount} 条命中）\n${semSearch.searchContext}`;
      allSources.push(...(semSearch.sources || []));
    }
    
    if (ftsSearch?.searchContext && !ftsSearch.skipped && ftsSearch.results?.length > 0) {
      if (searchContext) searchContext += '\n\n---\n\n';
      searchContext += `## FTS 全文搜索结果（${ftsSearch.resultCount} 条命中）\n${ftsSearch.searchContext}`;
      allSources.push(...(ftsSearch.sources || []).filter((s: any) => !allSources.some((a: any) => a.docId === s.docId)));
    }

    // 去重 sources
    const seenSources = new Set<string>();
    const uniqueSources = allSources.filter((s: any) => {
      const key = `${s.docType}:${s.docId}`;
      if (seenSources.has(key)) return false;
      seenSources.add(key);
      return true;
    });

    // 如果没有搜索结果，使用通用回答
    if (!searchContext || uniqueSources.length === 0) {
      const systemPrompt = `你是一个知识库问答助手。如果知识库没有相关内容，请基于你的通用知识回答用户问题。

**回答规则：**
1. 先说明"未在知识库中找到相关内容，以下为通用 AI 回答"
2. 基于你的知识用中文清晰回答
3. 条理清晰，适当分段
4. 回答要完整、有用，不要说"无法回答"`;

      const result = await callLlm(systemPrompt, `用户问题：${question}`, { temperature: 0.3 });
      return {
        answer: result.content,
        usedKnowledgeBase: false,
      };
    }

    // 构建答案
    const systemPrompt = `你是一个知识库问答助手。根据提供的「知识库上下文」回答用户问题。

**回答规则：**
1. 只基于 context 中的内容回答，不要编造
2. 如果 context 和问题不完全匹配，诚实说明，然后基于通用知识给出完整有用答案
3. 优先引用标题最相关的来源（如"根据《XXX》..."）
4. 不要被不相关来源带偏，只使用最相关的内容
5. 用中文回答，条理清晰，适当分段
6. **最关键**：如果所有 context 都与问题无关，**完全基于你的通用知识**给出完整有用的回答，不要拒绝`;

    const userPrompt = `${searchContext}\n\n---\n\n用户问题：${question}`;
    const result = await callLlm(systemPrompt, userPrompt, { temperature: 0.3 });

    return {
      answer: result.content,
      usedKnowledgeBase: true,
    };
  },
  timeout: 120_000,
};

// ─── DAG 定义 ───────────────────────────────────────────────────────────────

export const knowledgeQaDag: DagDefinition = {
  id: 'knowledge-qa',
  name: '知识库问答（多 Agent）',
  nodes: [
    classifyIntentNode,
    rewriteQueryNode,
    semanticSearchNode,
    ftsSearchNode,
    generateAnswerNode,
  ],
};

// ─── 执行入口 ────────────────────────────────────────────────────────────────

export async function runKnowledgeQaDag(
  question: string,
  repoName?: string | null,
  signal?: AbortSignal
): Promise<QaResult> {
  const startTime = Date.now();
  const initialInputs = { question, repoName };

  const result = await executeDag(knowledgeQaDag, initialInputs, signal);

  const genAnswer = result.outputs['generate_answer'];
  const intent = result.outputs['classify_intent'];
  const rewrite = result.outputs['rewrite_query'];

  // 合并所有 sources
  const allSources: any[] = [];
  const seenSources = new Set<string>();
  
  const addSources = (sources: any[]) => {
    if (!Array.isArray(sources)) return;
    for (const s of sources) {
      const key = `${s.docType}:${s.docId}`;
      if (!seenSources.has(key)) {
        seenSources.add(key);
        allSources.push(s);
      }
    }
  };

  const semSearch = result.outputs['semantic_search'];
  const ftsSearch = result.outputs['fts_search'];
  if (semSearch?.sources) addSources(semSearch.sources);
  if (ftsSearch?.sources) addSources(ftsSearch.sources);

  // 构建 nodeResults（简化版）
  const nodeResults: Record<string, any> = {};
  for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
    const r = nodeResult as any;
    if (nodeId === 'classify_intent') {
      nodeResults[nodeId] = { status: r.status, output: r.output, durationMs: r.durationMs };
    } else if (nodeId === 'rewrite_query') {
      nodeResults[nodeId] = { status: r.status, output: r.output, durationMs: r.durationMs };
    } else if (nodeId === 'semantic_search') {
      nodeResults[nodeId] = { 
        status: r.status, 
        hitCount: r.output?.hitCount || 0, 
        skipped: r.output?.skipped || false,
        durationMs: r.durationMs 
      };
    } else if (nodeId === 'fts_search') {
      nodeResults[nodeId] = { 
        status: r.status, 
        resultCount: r.output?.resultCount || 0, 
        skipped: r.output?.skipped || false,
        durationMs: r.durationMs 
      };
    } else if (nodeId === 'generate_answer') {
      nodeResults[nodeId] = { 
        status: r.status, 
        usedKnowledgeBase: r.output?.usedKnowledgeBase,
        durationMs: r.durationMs 
      };
    }
  }

  return {
    answer: genAnswer?.answer || '生成回答失败',
    sources: allSources.slice(0, 8),
    questionType: intent?.type || 'unknown',
    searchQueries: rewrite?.rewrittenQueries || [question],
    repoHint: semSearch?.repoHint || null,
    usedKnowledgeBase: genAnswer?.usedKnowledgeBase ?? true,
    dagOutputs: result.outputs,
    execution: {
      totalDurationMs: result.totalDurationMs,
      nodeResults,
    },
  };
}