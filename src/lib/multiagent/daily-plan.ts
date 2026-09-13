// @ts-nocheck
/**
 * 日计划 Multi-Agent DAG
 *
 * 架构：
 *   [收集今日任务] ─┐
 *   [收集未完成任务] ├─► 并行收集
 *   [收集备忘]     ─┤
 *   [收集 Daily]   ─┤
 *   [收集 Commits] ─┤
 *   [收集项目状态] ─┘
 *         ↓
 *   [优先级分析 Agent] ──► 分析任务重要性、紧急度
 *         ↓
 *   [计划生成 Agent]  ──► 生成今日计划
 *
 * 相比单 Agent：
 * - 数据收集并行执行，速度更快
 * - 优先级分析独立出来，决策更清晰
 * - 每个节点产出可独立检查
 */

import { AgentNode, DagDefinition, executeDag, callLlm, getAiConfig } from './index';
import type { RunContext } from './types';
import { db } from '../db/index';
import { tasks, memos, dailyPages, projects } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { getRepoActivity } from '../activity';
import { readMarkdown } from '../storage';
import { getTodayLocalDate } from '../activity';

export interface PlanResult {
  markdown: string;
  suggestedTasks: any[];
  nodeResults: Record<string, any>;
  execution: {
    totalDurationMs: number;
    nodeDurations: Record<string, number>;
  };
}

// ─── 工具函数 ───────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function dateOffset(date: string, offsetDays: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Level 1: 6 个并行数据收集 Agent ────────────────────────────────────────

/** 收集今日任务 */
const collectTodayTasks: AgentNode = {
  id: 'collect_today_tasks',
  name: '收集今日任务',
  deps: [],
  fn: async (_, ctx) => {
    const date: string = ctx.date;
    ctx.log('收集今日任务...');
    try {
      const rows = db.select({
        id: tasks.id, title: tasks.title, status: tasks.status,
        priority: tasks.priority, scheduledDate: tasks.scheduledDate, projectId: tasks.projectId,
      })
        .from(tasks)
        .where(sql`${tasks.scheduledDate} = ${date}`)
        .orderBy(tasks.priority)
        .limit(20)
        .all();

      const done = rows.filter((t: any) => t.status === 'done');
      const pending = rows.filter((t: any) => t.status !== 'done');

      return { total: rows.length, done: done.length, pending: pending.length, tasks: rows };
    } catch (err: any) {
      return { total: 0, done: 0, pending: 0, tasks: [], error: err.message };
    }
  },
  timeout: 30_000,
};

/** 收集未完成任务（历史遗留） */
const collectUndoneTasks: AgentNode = {
  id: 'collect_undone_tasks',
  name: '收集未完成任务',
  deps: [],
  fn: async (_, ctx) => {
    const date: string = ctx.date;
    ctx.log('收集未完成任务...');
    try {
      const rows = db.select({
        id: tasks.id, title: tasks.title, status: tasks.status,
        priority: tasks.priority, scheduledDate: tasks.scheduledDate, projectId: tasks.projectId,
      })
        .from(tasks)
        .where(sql`${tasks.status} != 'done' AND (${tasks.scheduledDate} < ${date} OR ${tasks.scheduledDate} IS NULL)`)
        .orderBy(tasks.priority)
        .limit(30)
        .all();

      return { total: rows.length, tasks: rows };
    } catch (err: any) {
      return { total: 0, tasks: [], error: err.message };
    }
  },
  timeout: 30_000,
};

/** 收集最近备忘录 */
const collectMemos: AgentNode = {
  id: 'collect_memos',
  name: '收集备忘录',
  deps: [],
  fn: async (_, ctx) => {
    const date: string = ctx.date;
    const threeDaysAgo = dateOffset(date, -3);
    const dayStart = `${threeDaysAgo}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;
    ctx.log('收集备忘录...');
    try {
      const rows = db.select({ id: memos.id, excerpt: memos.excerpt, updatedAt: memos.updatedAt })
        .from(memos)
        .where(sql`${memos.createdAt} BETWEEN ${dayStart} AND ${dayEnd} OR ${memos.updatedAt} BETWEEN ${dayStart} AND ${dayEnd}`)
        .orderBy(memos.updatedAt)
        .limit(15)
        .all();
      return { count: rows.length, memos: rows };
    } catch (err: any) {
      return { count: 0, memos: [], error: err.message };
    }
  },
  timeout: 30_000,
};

/** 收集最近 Daily 摘要 */
const collectDailyNotes: AgentNode = {
  id: 'collect_daily_notes',
  name: '收集 Daily 摘要',
  deps: [],
  fn: async (_, ctx) => {
    const date: string = ctx.date;
    const yesterday = dateOffset(date, -1);
    const dayBefore = dateOffset(date, -2);
    ctx.log('收集 Daily 摘要...');
    try {
      const result: any[] = [];
      for (const d of [date, yesterday, dayBefore]) {
        const row = db.select().from(dailyPages).where(eq(dailyPages.date, d)).get();
        if (row && row.filePath) {
          const content = readMarkdown(row.filePath);
          result.push({ date: d, content: truncate(content, 1500) });
        }
      }
      return { count: result.length, dailyNotes: result };
    } catch (err: any) {
      return { count: 0, dailyNotes: [], error: err.message };
    }
  },
  timeout: 30_000,
};

/** 收集 GitHub 提交 */
const collectCommits: AgentNode = {
  id: 'collect_commits',
  name: '收集 GitHub 提交',
  deps: [],
  fn: async (_, ctx) => {
    const date: string = ctx.date;
    const yesterday = dateOffset(date, -1);
    ctx.log('收集 GitHub 提交...');
    try {
      let commits: any[] = [];
      try {
        const activity = await getRepoActivity(date);
        commits = activity.repos.flatMap((r: any) =>
          r.commits.slice(0, 10).map((c: any) => ({
            repoName: r.repoName, shortHash: c.shortHash,
            message: c.message, changedFileCount: c.changedFileCount, date,
          }))
        );
      } catch { /* ignore */ }

      // 今天没提交就补昨天的
      if (commits.length === 0) {
        try {
          const yActivity = await getRepoActivity(yesterday);
          commits = yActivity.repos.flatMap((r: any) =>
            r.commits.slice(0, 10).map((c: any) => ({
              repoName: r.repoName, shortHash: c.shortHash,
              message: c.message, changedFileCount: c.changedFileCount, date: yesterday,
            }))
          );
        } catch { /* ignore */ }
      }

      const byRepo = new Map<string, any[]>();
      for (const c of commits) {
        if (!byRepo.has(c.repoName)) byRepo.set(c.repoName, []);
        byRepo.get(c.repoName)!.push(c);
      }

      return {
        total: commits.length,
        repos: Array.from(byRepo.entries()).map(([name, cs]) => ({ name, count: cs.length })),
        commits,
      };
    } catch (err: any) {
      return { total: 0, repos: [], commits: [], error: err.message };
    }
  },
  timeout: 60_000,
};

/** 收集项目状态 */
const collectProjectStatus: AgentNode = {
  id: 'collect_project_status',
  name: '收集项目状态',
  deps: [],
  fn: async (_, ctx) => {
    ctx.log('收集项目状态...');
    try {
      const allProjects = db.select().from(projects).all();
      const withCounts = allProjects.map((p: any) => {
        const count = db.select().from(tasks)
          .where(sql`${tasks.projectId} = ${p.id} AND ${tasks.status} != 'done'`)
          .all().length;
        return { id: p.id, name: p.name, color: p.color, status: p.status, undoneTaskCount: count };
      }).filter((p: any) => p.undoneTaskCount > 0);
      return { count: withCounts.length, projects: withCounts };
    } catch (err: any) {
      return { count: 0, projects: [], error: err.message };
    }
  },
  timeout: 30_000,
};

// ─── Level 2: 优先级分析 Agent ───────────────────────────────────────────────

const analyzePriorityNode: AgentNode = {
  id: 'analyze_priority',
  name: '优先级分析',
  deps: ['collect_today_tasks', 'collect_undone_tasks', 'collect_commits'],
  fn: async (inputs, ctx) => {
    const todayTasks = inputs['collect_today_tasks'];
    const undoneTasks = inputs['collect_undone_tasks'];
    const commits = inputs['collect_commits'];
    const userHint: string = ctx.userHint || '';
    ctx.log('分析任务优先级...');

    const systemPrompt = `你是一个任务优先级分析助手。请分析今日的任务情况，给出优先级建议。

**分析维度：**
1. 高优先级标准：直接影响项目进度、有明确 deadline、用户今日重点关注
2. 中优先级标准：有助于长期目标但可以稍后
3. 低优先级标准：可推迟、锦上添花
4. 考虑任务之间的依赖关系

**输出格式（严格 JSON）：**
{
  "criticalTasks": ["必须今天完成的任务"],
  "importantTasks": ["应该今天完成的任务"],
  "deferrableTasks": ["可以推迟的任务"],
  "reasoning": "优先级分析说明（50字内）"
}`;

    const context = `今日任务 (${todayTasks.total} 个，已完成 ${todayTasks.done})：
${(todayTasks.tasks || []).map((t: any) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title} (优先级: ${t.priority})`).join('\n')}

未完成任务 (${undoneTasks.total} 条历史遗留)：
${(undoneTasks.tasks || []).slice(0, 15).map((t: any) => `- ${t.title} (优先级: ${t.priority})`).join('\n')}${undoneTasks.total > 15 ? `\n...还有 ${undoneTasks.total - 15} 条` : ''}

GitHub 提交 (${commits.total} 次)：
${commits.repos?.map((r: any) => `- ${r.name}: ${r.count} 次提交`).join('\n') || '无'}

用户今日重点：${userHint || '无'}`;

    const result = await callLlm(systemPrompt, context, { temperature: 0.2 });

    let parsed = { criticalTasks: [] as string[], importantTasks: [] as string[], deferrableTasks: [] as string[], reasoning: '' };
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { /* use defaults */ }

    ctx.log(`优先级分析：${parsed.criticalTasks.length} 个关键，${parsed.importantTasks.length} 个重要，${parsed.deferrableTasks.length} 个可推迟`);
    return parsed;
  },
  timeout: 60_000,
};

// ─── Level 3: 计划生成 Agent ─────────────────────────────────────────────────

const generatePlanNode: AgentNode = {
  id: 'generate_plan',
  name: '生成日计划',
  deps: ['analyze_priority', 'collect_memos', 'collect_daily_notes', 'collect_project_status'],
  fn: async (inputs, ctx) => {
    const date: string = ctx.date;
    const userHint: string = ctx.userHint || '';
    const priority = inputs['analyze_priority'];
    const memos = inputs['collect_memos'];
    const dailyNotes = inputs['collect_daily_notes'];
    const projectStatus = inputs['collect_project_status'];
    ctx.log('生成日计划...');

    const systemPrompt = `你是我的个人日计划助手。基于以下信息生成当天可执行的工作计划。

**规则：**
1. 不要编造已完成的事情
2. 如果信息不足，明确说明"记录不足"
3. 计划要实用、分优先级、能落地
4. 用户提供的 userHint 是今日重点偏好，不是已完成事实

**输出格式（严格 JSON，无 markdown code fence）：**
{
  "markdown": "# YYYY-MM-DD 日计划\\n\\n## 今日重点 3 件事\\n\\n## 上午\\n\\n## 下午\\n\\n## 收尾\\n\\n## 待确认问题\\n\\n## 可推迟事项\\n\\n## 建议新建任务",
  "suggestedTasks": [
    {"title": "任务标题", "priority": "high|medium|low", "projectName": "项目名（可空）", "reason": "建议原因"}
  ]
}`;

    const context = `## 日期
${date}

## 用户今日重点
${userHint || '无明确指示'}

## 优先级分析结果
关键任务 (${priority.criticalTasks?.length || 0})：
${(priority.criticalTasks || []).map((t: string) => `- ${t}`).join('\n') || '无'}

重要任务 (${priority.importantTasks?.length || 0})：
${(priority.importantTasks || []).map((t: string) => `- ${t}`).join('\n') || '无'}

可推迟任务 (${priority.deferrableTasks?.length || 0})：
${(priority.deferrableTasks || []).map((t: string) => `- ${t}`).join('\n') || '无'}

优先级分析说明：${priority.reasoning || '无'}

## 备忘
${memos.count > 0 ? memos.memos.map((m: any) => `- ${truncate(m.excerpt || '', 200)}`).join('\n') : '无'}

## 项目状态
${projectStatus.count > 0 ? projectStatus.projects.map((p: any) => `- ${p.name}: ${p.undoneTaskCount} 个未完成`).join('\n') : '无'}`;

    const result = await callLlm(systemPrompt, context, { temperature: 0.4 });

    // 解析 JSON
    let markdown = result.content;
    let suggestedTasks: any[] = [];

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.markdown) markdown = parsed.markdown;
        if (Array.isArray(parsed.suggestedTasks)) {
          suggestedTasks = parsed.suggestedTasks.filter((t: any) => t && typeof t.title === 'string');
        }
      }
    } catch { /* use raw content */ }

    // 替换日期占位符
    markdown = markdown.replace(/YYYY-MM-DD/g, date);

    return { markdown, suggestedTasks };
  },
  timeout: 120_000,
};

// ─── DAG 定义 ───────────────────────────────────────────────────────────────

export const dailyPlanDag: DagDefinition = {
  id: 'daily-plan',
  name: 'AI 日计划生成（多 Agent）',
  nodes: [
    // Level 1: 6 个并行收集节点
    collectTodayTasks,
    collectUndoneTasks,
    collectMemos,
    collectDailyNotes,
    collectCommits,
    collectProjectStatus,
    // Level 2: 优先级分析（等待关键数据收集）
    analyzePriorityNode,
    // Level 3: 计划生成（等待所有数据）
    generatePlanNode,
  ],
};

// ─── 执行入口 ────────────────────────────────────────────────────────────────

export async function runDailyPlanDag(
  date: string,
  userHint?: string,
  signal?: AbortSignal
): Promise<PlanResult> {
  const startTime = Date.now();
  const initialInputs = { date, userHint: userHint || '' };

  const result = await executeDag(dailyPlanDag, initialInputs, signal);

  const plan = result.outputs['generate_plan'];
  const nodeDurations: Record<string, number> = {};

  for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
    const r = nodeResult as any;
    nodeDurations[nodeId] = r.durationMs || 0;
  }

  return {
    markdown: plan?.markdown || '生成日计划失败',
    suggestedTasks: plan?.suggestedTasks || [],
    nodeResults: result.outputs,
    execution: {
      totalDurationMs: result.totalDurationMs,
      nodeDurations,
    },
  };
}