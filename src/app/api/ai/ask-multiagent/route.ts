// @ts-nocheck
/**
 * 多 Agent 知识库问答 API
 * 
 * 架构：
 * [意图分类] → [查询改写] → 并行 [语义搜索 + FTS搜索] → [答案生成]
 */

import { NextRequest, NextResponse } from 'next/server';
import { runKnowledgeQaDag } from '@/lib/multiagent/knowledge-qa';
import { getAiConfig } from '@/lib/multiagent/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  // 检查 AI 配置
  const aiConfig = getAiConfig();
  if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.model) {
    return NextResponse.json({ configured: false, error: 'AI 未配置' });
  }

  let question = '';
  let repoName: string | null = null;
  
  try {
    const body = await req.json();
    question = typeof body.question === 'string' ? body.question.trim() : '';
    repoName = typeof body.repoName === 'string' ? body.repoName.trim() || null : null;
    
    if (!question) {
      return NextResponse.json({ error: 'question 是必填项' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 });
  }

  try {
    console.log(`[ask-multiagent] question="${question}", repoName=${repoName}`);
    const startTime = Date.now();

    const result = await runKnowledgeQaDag(question, repoName);

    const duration = Date.now() - startTime;
    console.log(`[ask-multiagent] DAG completed in ${duration}ms, status=${result.execution.nodeResults.generate_answer?.status}`);

    return NextResponse.json({
      configured: true,
      question,
      answer: result.answer,
      sources: result.sources,
      questionType: result.questionType,
      searchQueries: result.searchQueries,
      repoHint: result.repoHint,
      usedKnowledgeBase: result.usedKnowledgeBase,
      execution: result.execution,
    });
  } catch (err: any) {
    console.error('[ask-multiagent] Error:', err);
    return NextResponse.json({
      configured: true,
      error: `多 Agent 问答失败: ${err.message}`,
    }, { status: 500 });
  }
}