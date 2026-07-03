// @ts-nocheck
import { db } from './db/index';
import { tasks, memos, dailyPages, projects } from './db/schema';
import { eq, sql, gte, lte, ne, or, isNull } from 'drizzle-orm';
import { getRepoActivity } from './activity';
import { readMarkdown } from './storage';
import { getTodayLocalDate } from './activity';

export interface SuggestedTask {
  title: string;
  priority: string;
  projectName: string;
  reason: string;
}

export interface PlanSources {
  tasks: any[];
  undoneTasks: any[];
  memos: any[];
  daily: any[];
  commits: any[];
  projects: any[];
}

export interface PlanContext {
  date: string;
  userHint: string;
  sources: PlanSources;
  prompt: string;
}

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

export async function collectDailyPlanContext(date: string, userHint: string): Promise<PlanContext> {
  const yesterday = dateOffset(date, -1);
  const dayBefore = dateOffset(date, -2);
  const threeDaysAgo = dateOffset(date, -3);
  const dayStart = `${threeDaysAgo}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  // 1. 今日任务
  const todayTasks = db.select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    priority: tasks.priority,
    scheduledDate: tasks.scheduledDate,
    projectId: tasks.projectId,
  })
    .from(tasks)
    .where(sql`${tasks.scheduledDate} = ${date}`)
    .orderBy(tasks.priority)
    .limit(20)
    .all();

  // 2. 昨天及之前未完成任务（包括未安排的）
  const undoneTasks = db.select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    priority: tasks.priority,
    scheduledDate: tasks.scheduledDate,
    projectId: tasks.projectId,
  })
    .from(tasks)
    .where(sql`${tasks.status} != 'done' AND (${tasks.scheduledDate} < ${date} OR ${tasks.scheduledDate} IS NULL)`)
    .orderBy(tasks.priority)
    .limit(30)
    .all();

  // 3. 最近 3 天 memos
  const recentMemos = db.select({
    id: memos.id,
    excerpt: memos.excerpt,
    updatedAt: memos.updatedAt,
  })
    .from(memos)
    .where(sql`${memos.createdAt} BETWEEN ${dayStart} AND ${dayEnd} OR ${memos.updatedAt} BETWEEN ${dayStart} AND ${dayEnd}`)
    .orderBy(memos.updatedAt)
    .limit(15)
    .all();

  // 4. 最近 3 天 Daily（重点提取明日跟进/TODO/问题）
  const recentDaily: any[] = [];
  const dates = [date, yesterday, dayBefore];
  for (const d of dates) {
    try {
      const row = db.select().from(dailyPages).where(eq(dailyPages.date, d)).get();
      if (row && row.filePath) {
        const content = readMarkdown(row.filePath);
        recentDaily.push({
          date: d,
          content: truncate(content, 1500),
        });
      }
    } catch { /* ignore */ }
  }

  // 5. 最近 GitHub commits（今天 + 昨天补充）
  let commits: any[] = [];
  try {
    const todayActivity = await getRepoActivity(date);
    commits = todayActivity.repos.flatMap(r =>
      r.commits.slice(0, 10).map(c => ({
        repoName: r.repoName,
        shortHash: c.shortHash,
        message: c.message,
        changedFileCount: c.changedFileCount,
        changedFiles: c.changedFiles.slice(0, 10),
        date,
      }))
    );
    // 今天没 commit 就补昨天的
    if (commits.length === 0) {
      const yActivity = await getRepoActivity(yesterday);
      commits = yActivity.repos.flatMap(r =>
        r.commits.slice(0, 10).map(c => ({
          repoName: r.repoName,
          shortHash: c.shortHash,
          message: c.message,
          changedFileCount: c.changedFileCount,
          changedFiles: c.changedFiles.slice(0, 10),
          date: yesterday,
        }))
      );
    }
  } catch { /* ignore */ }

  // 6. 项目未完成任务统计
  const allProjects = db.select().from(projects).all();
  const projectTaskCounts = allProjects.map(p => {
    const count = db.select().from(tasks)
      .where(sql`${tasks.projectId} = ${p.id} AND ${tasks.status} != 'done'`)
      .all().length;
    return { id: p.id, name: p.name, color: p.color, status: p.status, undoneTaskCount: count };
  }).filter(p => p.undoneTaskCount > 0);

  const sources: PlanSources = {
    tasks: todayTasks,
    undoneTasks,
    memos: recentMemos,
    daily: recentDaily,
    commits,
    projects: projectTaskCounts,
  };

  const prompt = buildPlanPrompt(date, userHint, sources);
  return { date, userHint, sources, prompt };
}

function buildPlanPrompt(date: string, userHint: string, sources: PlanSources): string {
  const parts: string[] = [];

  parts.push(`日期：${date}`);

  if (userHint) {
    parts.push(`\n## 用户今日重点\n${userHint}`);
  }

  // 今日任务
  if (sources.tasks.length > 0) {
    parts.push('\n## 今日已安排任务');
    sources.tasks.forEach(t => {
      parts.push(`  - [${t.status === 'done' ? 'x' : ' '}] ${t.title} (优先级: ${t.priority})`);
    });
  }

  // 未完成任务
  if (sources.undoneTasks.length > 0) {
    parts.push('\n## 未完成任务（含历史遗留）');
    sources.undoneTasks.slice(0, 20).forEach(t => {
      const sched = t.scheduledDate ? ` (计划: ${t.scheduledDate})` : ' (未安排)';
      parts.push(`  - ${t.title} (优先级: ${t.priority})${sched}`);
    });
    if (sources.undoneTasks.length > 20) {
      parts.push(`  ...还有 ${sources.undoneTasks.length - 20} 条未列出`);
    }
  }

  // 最近备忘
  if (sources.memos.length > 0) {
    parts.push('\n## 最近备忘');
    sources.memos.forEach(m => {
      parts.push(`  - ${truncate(m.excerpt || '', 200)}`);
    });
  }

  // 最近 Daily（提取关键信息）
  if (sources.daily.length > 0) {
    parts.push('\n## 最近 Daily 摘要');
    sources.daily.forEach(d => {
      parts.push(`### ${d.date}`);
      parts.push(truncate(d.content, 1500));
    });
  }

  // GitHub commits
  if (sources.commits.length > 0) {
    parts.push('\n## 最近 GitHub 提交');
    const byRepo = new Map<string, any[]>();
    sources.commits.forEach(c => {
      if (!byRepo.has(c.repoName)) byRepo.set(c.repoName, []);
      byRepo.get(c.repoName)!.push(c);
    });
    for (const [repoName, repoCommits] of byRepo) {
      parts.push(`${repoName} (${repoCommits.length} 次，${repoCommits[0].date})：`);
      repoCommits.slice(0, 10).forEach(c => {
        parts.push(`  - ${c.shortHash} ${c.message} (改动 ${c.changedFileCount} 文件)`);
      });
    }
  }

  // 项目状态
  if (sources.projects.length > 0) {
    parts.push('\n## 项目未完成任务数');
    sources.projects.forEach(p => {
      parts.push(`  - ${p.name}: ${p.undoneTaskCount} 个未完成`);
    });
  }

  let prompt = parts.join('\n');
  if (prompt.length > 12000) {
    prompt = prompt.slice(0, 12000) + '\n\n...（已截断）';
  }
  return prompt;
}

export function buildPlanSystemPrompt(): string {
  return `你是我的个人日计划助手。你需要基于提供的任务、备忘录、Daily、GitHub 提交和用户补充说明，生成当天可执行的工作计划。

**规则：**
1. 不要编造已经完成的事情
2. 不要把不确定事项说成事实
3. 如果信息不足，明确说明"记录不足"
4. 计划要实用、分优先级、能落地
5. 用户提供的 userHint 是今日重点偏好，不是已完成事实

**输出要求：**
返回严格的 JSON 格式（不要在 JSON 外加任何文字、不要加 markdown code fence）：

{
  "markdown": "# YYYY-MM-DD 日计划\\n\\n## 今日重点 3 件事\\n\\n1.\\n2.\\n3.\\n\\n## 上午\\n\\n## 下午\\n\\n## 晚上 / 收尾\\n\\n## 待确认问题\\n\\n## 可推迟事项\\n\\n## 建议新建任务\\n\\n## 风险提醒",
  "suggestedTasks": [
    {
      "title": "任务标题",
      "priority": "high|medium|low",
      "projectName": "项目名（可空）",
      "reason": "建议原因"
    }
  ]
}

注意：
- markdown 字段是完整日计划 Markdown 文本
- suggestedTasks 是建议新建的任务候选，不要与已有任务重复
- 如果没有建议任务，suggestedTasks 返回空数组 []`;
}

export function parsePlanResponse(content: string): { markdown: string; suggestedTasks: SuggestedTask[] } {
  // 尝试解析 JSON
  try {
    // 去除可能的 markdown code fence
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.markdown === 'string') {
      const tasks = Array.isArray(parsed.suggestedTasks) ? parsed.suggestedTasks : [];
      const validTasks = tasks
        .filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
        .map((t: any) => ({
          title: String(t.title).trim(),
          priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
          projectName: String(t.projectName || ''),
          reason: String(t.reason || ''),
        }));
      return { markdown: parsed.markdown, suggestedTasks: validTasks };
    }
  } catch {
    // JSON parse 失败，把整个内容当 markdown
  }

  return { markdown: content, suggestedTasks: [] };
}
