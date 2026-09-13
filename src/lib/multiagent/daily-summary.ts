// ─── Daily Summary Multi-Agent DAG ─────────────────────────────────────────

import { AgentNode, DagDefinition, executeDag, DagResult, getAiConfig, callLlm } from './index';
import type { RunContext } from './types';
import { db } from '../db/index';
import { tasks, notes, memos, dailyPages } from '../db/schema';
import { sql, eq } from 'drizzle-orm';
import { getRepoActivity } from '../activity';
import { readMarkdown } from '../storage';

/** 收集今日任务数据 */
async function collectTasks(date: string) {
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const todayTasks = db.select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    priority: tasks.priority,
    scheduledDate: tasks.scheduledDate,
    completedAt: tasks.completedAt,
  })
    .from(tasks)
    .where(sql`${tasks.scheduledDate} = ${date} OR ${tasks.completedAt} BETWEEN ${dayStart} AND ${dayEnd} OR (${tasks.status} != 'done' AND ${tasks.scheduledDate} IS NULL)`)
    .orderBy(tasks.priority)
    .limit(20)
    .all();

  const completed = todayTasks.filter(t => t.status === 'done');
  const pending = todayTasks.filter(t => t.status !== 'done');

  return {
    total: todayTasks.length,
    completed: completed.length,
    pending: pending.length,
    completedTasks: completed,
    pendingTasks: pending,
  };
}

/** 收集今日笔记数据 */
async function collectNotes(date: string) {
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const todayNotes = db.select({
    id: notes.id,
    title: notes.title,
    slug: notes.slug,
    excerpt: notes.excerpt,
    updatedAt: notes.updatedAt,
  })
    .from(notes)
    .where(sql`${notes.createdAt} BETWEEN ${dayStart} AND ${dayEnd} OR ${notes.updatedAt} BETWEEN ${dayStart} AND ${dayEnd}`)
    .orderBy(notes.updatedAt)
    .limit(10)
    .all();

  return {
    count: todayNotes.length,
    notes: todayNotes,
  };
}

/** 收集今日备忘录数据 */
async function collectMemos(date: string) {
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const todayMemos = db.select({
    id: memos.id,
    slug: memos.slug,
    excerpt: memos.excerpt,
    updatedAt: memos.updatedAt,
  })
    .from(memos)
    .where(sql`${memos.createdAt} BETWEEN ${dayStart} AND ${dayEnd} OR ${memos.updatedAt} BETWEEN ${dayStart} AND ${dayEnd}`)
    .orderBy(memos.updatedAt)
    .limit(10)
    .all();

  return {
    count: todayMemos.length,
    memos: todayMemos,
  };
}

/** 收集 GitHub 提交数据 */
async function collectCommits(date: string) {
  try {
    const activity = await getRepoActivity(date);
    const allCommits = activity.repos.flatMap(r =>
      r.commits.slice(0, 10).map(c => ({
        repoName: r.repoName,
        shortHash: c.shortHash,
        message: c.message,
        changedFileCount: c.changedFileCount,
      }))
    );
    return {
      totalCommits: allCommits.length,
      repos: activity.repos.map(r => ({
        name: r.repoName,
        commitCount: r.commits.length,
      })),
      commits: allCommits,
    };
  } catch {
    return { totalCommits: 0, repos: [], commits: [] };
  }
}

/** 收集 Daily 页面数据 */
async function collectDaily(date: string) {
  try {
    const dailyRow = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();
    if (dailyRow?.filePath) {
      const content = readMarkdown(dailyRow.filePath) || '';
      return { hasContent: true, content: content.slice(0, 2000) };
    }
  } catch {}
  return { hasContent: false, content: '' };
}

/** Agent 1: 数据收集 - 任务 */
const collectTasksNode: AgentNode = {
  id: 'collect_tasks',
  name: '收集任务数据',
  deps: [],
  fn: async (_, ctx) => {
    const date = (ctx as any).date;
    ctx.log('收集今日任务...');
    return collectTasks(date);
  },
  timeout: 30_000,
};

/** Agent 2: 数据收集 - 笔记 */
const collectNotesNode: AgentNode = {
  id: 'collect_notes',
  name: '收集笔记数据',
  deps: [],
  fn: async (_, ctx) => {
    const date = (ctx as any).date;
    ctx.log('收集今日笔记...');
    return collectNotes(date);
  },
  timeout: 30_000,
};

/** Agent 3: 数据收集 - 备忘录 */
const collectMemosNode: AgentNode = {
  id: 'collect_memos',
  name: '收集备忘录数据',
  deps: [],
  fn: async (_, ctx) => {
    const date = (ctx as any).date;
    ctx.log('收集今日备忘录...');
    return collectMemos(date);
  },
  timeout: 30_000,
};

/** Agent 4: 数据收集 - GitHub 提交 */
const collectCommitsNode: AgentNode = {
  id: 'collect_commits',
  name: '收集 GitHub 提交',
  deps: [],
  fn: async (_, ctx) => {
    const date = (ctx as any).date;
    ctx.log('收集 GitHub 提交...');
    return collectCommits(date);
  },
  timeout: 60_000,
};

/** Agent 5: 数据收集 - Daily 页面 */
const collectDailyNode: AgentNode = {
  id: 'collect_daily',
  name: '收集 Daily 内容',
  deps: [],
  fn: async (_, ctx) => {
    const date = (ctx as any).date;
    ctx.log('收集 Daily 页面...');
    return collectDaily(date);
  },
  timeout: 30_000,
};

/** Agent 6: 任务分析 - 分析任务完成情况并生成摘要 */
const analyzeTasksNode: AgentNode = {
  id: 'analyze_tasks',
  name: '分析任务完成情况',
  deps: ['collect_tasks'],
  fn: async (inputs) => {
    const { completedTasks, pendingTasks } = inputs['collect_tasks'];
    
    if (!completedTasks.length && !pendingTasks.length) {
      return { summary: '今日无任务记录', keyInsights: [] };
    }

    const systemPrompt = `你是一个任务分析助手。请分析今日的任务完成情况，提取关键洞察。

**分析要点：**
1. 完成率如何？是否达到预期？
2. 高优先级任务是否都完成了？
3. 是否有重要任务被推迟了？
4. 任务完成效率如何？

**输出要求：**
- 用中文回答
- 简洁有力，2-3 句话总结
- 提取 1-3 个关键洞察`;
    
    const userPrompt = `今日任务完成情况：

已完成 (${completedTasks.length}):
${completedTasks.map(t => `- ${t.title} (优先级: ${t.priority})`).join('\n') || '无'}

未完成 (${pendingTasks.length}):
${pendingTasks.map(t => `- ${t.title} (优先级: ${t.priority})`).join('\n') || '无'}

请分析并给出关键洞察。`;

    const result = await callLlm(systemPrompt, userPrompt, { temperature: 0.3 });
    return {
      summary: result.content,
      keyInsights: result.content.split('\n').filter(l => l.trim()),
      completedCount: completedTasks.length,
      pendingCount: pendingTasks.length,
    };
  },
  timeout: 60_000,
};

/** Agent 7: 编码活动分析 - 分析 GitHub 提交并给出评价 */
const analyzeCommitsNode: AgentNode = {
  id: 'analyze_commits',
  name: '分析编码活动',
  deps: ['collect_commits'],
  fn: async (inputs) => {
    const { commits, totalCommits, repos } = inputs['collect_commits'];
    
    if (!totalCommits) {
      return { summary: '今日无 GitHub 提交', keyInsights: [] };
    }

    const systemPrompt = `你是一个代码活动分析助手。请分析今日的 GitHub 提交活动，提取关键信息。

**分析要点：**
1. 今天主要在哪个项目/仓库工作？
2. 提交的消息是否清晰反映了工作内容？
3. 有没有重要的功能完成或问题修复？
4. 改动规模如何？

**输出要求：**
- 用中文回答
- 简洁，1-2 句话总结整体活动
- 重点突出有意义的提交`;
    
    const commitList = commits.map(c => `[${c.repoName}] ${c.shortHash} ${c.message} (+${c.changedFileCount} 文件)`).join('\n');
    const userPrompt = `今日 GitHub 提交 (${totalCommits} 次):

仓库分布:
${repos.map(r => `- ${r.name}: ${r.commitCount} 次提交`).join('\n')}

详细提交:
${commitList}

请分析今日编码活动。`;

    const result = await callLlm(systemPrompt, userPrompt, { temperature: 0.3 });
    return {
      summary: result.content,
      keyInsights: result.content.split('\n').filter(l => l.trim()),
      totalCommits,
      topRepo: repos.sort((a, b) => b.commitCount - a.commitCount)[0]?.name || '',
    };
  },
  timeout: 60_000,
};

/** Agent 8: 日总结生成 - 整合所有分析生成最终日报 */
const generateSummaryNode: AgentNode = {
  id: 'generate_summary',
  name: '生成日总结',
  deps: ['analyze_tasks', 'analyze_commits', 'collect_notes', 'collect_memos', 'collect_daily'],
  fn: async (inputs) => {
    const taskAnalysis = inputs['analyze_tasks'];
    const commitAnalysis = inputs['analyze_commits'];
    const notes = inputs['collect_notes'];
    const memos = inputs['collect_memos'];
    const daily = inputs['collect_daily'];

    const systemPrompt = `你是一个专业的工作日报助手。请基于以下信息生成一份精美的日报。

**输入信息：**
- 任务分析结果（已完成、未完成、关键洞察）
- GitHub 编码活动分析
- 今日笔记（可选）
- 今日备忘录（可选）
- Daily 页面内容（可选）

**输出格式：**
# YYYY-MM-DD 工作日报

## 今日完成
- 列出已完成的重要任务

## 今日进展
- 列出正在进行中的工作
- 编码活动摘要

## GitHub 提交摘要
- 各仓库提交情况

## 遇到的问题
- 如果有未完成的任务，分析原因

## 明日计划
- 基于今日情况，建议明天的工作重点

**规则：**
1. 只基于提供的信息，不要编造
2. 如果某个分类没有数据，对应章节写"暂无"
3. 用 Markdown 格式输出
4. 突出重点，不要流水账
5. 总字数控制在 300-500 字`;

    const contextParts: string[] = [];
    
    contextParts.push(`## 任务分析\n${taskAnalysis?.summary || '暂无任务数据'}`);
    contextParts.push(`\n已完成任务 (${taskAnalysis?.completedCount || 0}):\n${(taskAnalysis?.completedTasks || []).map((t: any) => `- ${t.title}`).join('\n') || '无'}`);
    contextParts.push(`\n未完成任务 (${taskAnalysis?.pendingCount || 0}):\n${(taskAnalysis?.pendingTasks || []).map((t: any) => `- ${t.title}`).join('\n') || '无'}`);

    contextParts.push(`\n\n## 编码活动\n${commitAnalysis?.summary || '今日无提交'}`);

    if (notes?.count > 0) {
      contextParts.push(`\n\n## 今日笔记 (${notes.count} 篇)\n${notes.notes.map((n: any) => `- ${n.title || '无标题'}`).join('\n')}`);
    }

    if (memos?.count > 0) {
      contextParts.push(`\n\n## 今日备忘录 (${memos.count} 条)\n${memos.memos.map((m: any) => `- ${(m.excerpt || '').slice(0, 100)}`).join('\n')}`);
    }

    if (daily?.hasContent) {
      contextParts.push(`\n\n## Daily 页面内容\n${daily.content.slice(0, 1500)}`);
    }

    const userPrompt = contextParts.join('\n');

    const result = await callLlm(systemPrompt, userPrompt, { temperature: 0.4 });
    return {
      markdown: result.content,
      usage: result.usage,
    };
  },
  timeout: 120_000,
};

/** 日总结 DAG 定义 */
export const dailySummaryDag: DagDefinition = {
  id: 'daily-summary',
  name: 'AI 日总结生成',
  nodes: [
    // 第一层：并行收集数据（5 个节点）
    collectTasksNode,
    collectNotesNode,
    collectMemosNode,
    collectCommitsNode,
    collectDailyNode,
    // 第二层：并行分析（2 个节点）
    analyzeTasksNode,
    analyzeCommitsNode,
    // 第三层：汇总生成（1 个节点）
    generateSummaryNode,
  ],
};

/** 执行日总结 DAG */
export async function runDailySummaryDag(
  date: string,
  signal?: AbortSignal
): Promise<DagResult & { summary: string; nodeOutputs: Record<string, any> }> {
  const initialInputs = { date };
  const result = await executeDag(dailySummaryDag, initialInputs, signal);
  
  const summary = result.outputs['generate_summary']?.markdown || '';
  const nodeOutputs = result.outputs;
  
  return {
    ...result,
    summary,
    nodeOutputs,
  };
}