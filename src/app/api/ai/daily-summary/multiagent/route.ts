// @ts-nocheck
/**
 * 多 Agent 日总结 API
 * 
 * 使用多 Agent DAG 架构：
 * - Level 1（并行）：收集任务、笔记、备忘录、提交、Daily
 * - Level 2（并行）：分析任务完成情况、分析编码活动
 * - Level 3（顺序）：生成最终日报
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDailySummaryDag } from '@/lib/multiagent/daily-summary';
import { getTodayLocalDate } from '@/lib/activity';
import { getAiConfig } from '@/lib/multiagent/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 分钟超时

export async function POST(req: NextRequest) {
  // 检查 AI 配置
  const aiConfig = getAiConfig();
  if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.model) {
    return NextResponse.json({ configured: false, error: 'AI 未配置' });
  }

  let date: string;
  try {
    const body = await req.json();
    date = (body.date || '').trim() || getTodayLocalDate();
  } catch {
    date = getTodayLocalDate();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date 必须为 YYYY-MM-DD 格式' }, { status: 400 });
  }

  try {
    console.log(`[multiagent-daily-summary] Starting DAG for ${date}`);
    const startTime = Date.now();

    // 执行 DAG
    const result = await runDailySummaryDag(date);

    const duration = Date.now() - startTime;
    console.log(`[multiagent-daily-summary] DAG completed in ${duration}ms, status: ${result.status}`);

    // 提取每个节点的输出用于调试/展示
    const nodeOutputs: Record<string, any> = {};
    for (const [nodeId, output] of Object.entries(result.outputs)) {
      if (output && typeof output === 'object') {
        // 提取关键信息用于展示
        if (nodeId === 'collect_tasks') {
          nodeOutputs[nodeId] = {
            type: 'data_collected',
            message: `收集到 ${output.total || 0} 个任务（已完成 ${output.completed || 0}）`,
            summary: output,
          };
        } else if (nodeId === 'collect_notes') {
          nodeOutputs[nodeId] = {
            type: 'data_collected',
            message: `收集到 ${output.count || 0} 篇笔记`,
            summary: output,
          };
        } else if (nodeId === 'collect_memos') {
          nodeOutputs[nodeId] = {
            type: 'data_collected',
            message: `收集到 ${output.count || 0} 条备忘录`,
            summary: output,
          };
        } else if (nodeId === 'collect_commits') {
          nodeOutputs[nodeId] = {
            type: 'data_collected',
            message: `收集到 ${output.totalCommits || 0} 次提交`,
            summary: output,
          };
        } else if (nodeId === 'analyze_tasks') {
          nodeOutputs[nodeId] = {
            type: 'analysis',
            message: '任务分析完成',
            summary: output.summary,
          };
        } else if (nodeId === 'analyze_commits') {
          nodeOutputs[nodeId] = {
            type: 'analysis',
            message: '编码活动分析完成',
            summary: output.summary,
          };
        } else if (nodeId === 'generate_summary') {
          nodeOutputs[nodeId] = {
            type: 'final_output',
            message: '日总结生成完成',
          };
        }
      }
    }

    return NextResponse.json({
      configured: true,
      date,
      status: result.status,
      summary: result.summary,
      markdown: result.summary, // 兼容旧接口
      nodeOutputs,
      execution: {
        totalDurationMs: result.totalDurationMs,
        nodeResults: Object.fromEntries(
          Object.entries(result.nodeResults).map(([id, r]) => [
            id,
            {
              status: r.status,
              durationMs: r.durationMs,
              error: r.error,
            },
          ])
        ),
      },
    });
  } catch (err: any) {
    console.error('[multiagent-daily-summary] Error:', err);
    return NextResponse.json({
      configured: true,
      error: `多 Agent 日总结失败: ${err.message}`,
    }, { status: 500 });
  }
}