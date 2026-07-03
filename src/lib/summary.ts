// @ts-nocheck
import { db } from './db/index';
import { tasks, notes, memos, dailyPages } from './db/schema';
import { eq, sql } from 'drizzle-orm';
import { getRepoActivity } from './activity';
import { readMarkdown } from './storage';

export interface SummarySources {
  tasks: any[];
  notes: any[];
  memos: any[];
  daily: any | null;
  commits: any[];
}

export interface SummaryContext {
  date: string;
  sources: SummarySources;
  prompt: string;
}

function startOfDay(date: string): string {
  return `${date}T00:00:00`;
}

function endOfDay(date: string): string {
  return `${date}T23:59:59`;
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

export async function collectDailySummaryContext(date: string): Promise<SummaryContext> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // 1. 今日任务
  const todayTasks = db.select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    priority: tasks.priority,
    scheduledDate: tasks.scheduledDate,
    completedAt: tasks.completedAt,
    updatedAt: tasks.updatedAt,
  })
    .from(tasks)
    .where(sql`${tasks.scheduledDate} = ${date} OR ${tasks.completedAt} BETWEEN ${dayStart} AND ${dayEnd} OR (${tasks.status} != 'done' AND ${tasks.scheduledDate} IS NULL)`)
    .orderBy(tasks.priority)
    .limit(20)
    .all();

  // 2. 今日笔记
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

  // 3. 今日备忘录
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

  // 4. 今日 Daily
  let todayDaily: any = null;
  try {
    const dailyRow = db.select().from(dailyPages).where(eq(dailyPages.date, date)).get();
    if (dailyRow) {
      const content = dailyRow.filePath ? readMarkdown(dailyRow.filePath) : '';
      todayDaily = {
        date: dailyRow.date,
        content: truncate(content, 2000),
      };
    }
  } catch { /* ignore */ }

  // 5. GitHub commits
  let commits: any[] = [];
  try {
    const activity = await getRepoActivity(date);
    commits = activity.repos.flatMap(r =>
      r.commits.slice(0, 10).map(c => ({
        repoName: r.repoName,
        shortHash: c.shortHash,
        message: c.message,
        changedFileCount: c.changedFileCount,
        changedFiles: c.changedFiles.slice(0, 10),
      }))
    );
  } catch { /* ignore, keep empty */ }

  const sources: SummarySources = {
    tasks: todayTasks,
    notes: todayNotes,
    memos: todayMemos,
    daily: todayDaily,
    commits,
  };

  // 组装 prompt（限制总长度）
  const prompt = buildPrompt(date, sources);

  return { date, sources, prompt };
}

function buildPrompt(date: string, sources: SummarySources): string {
  const parts: string[] = [];

  parts.push(`日期：${date}`);

  // 任务
  if (sources.tasks.length > 0) {
    const completed = sources.tasks.filter(t => t.status === 'done');
    const undone = sources.tasks.filter(t => t.status !== 'done');
    parts.push('\n## 今日任务');
    if (completed.length > 0) {
      parts.push('已完成：');
      completed.forEach(t => parts.push(`  - [x] ${t.title}`));
    }
    if (undone.length > 0) {
      parts.push('未完成：');
      undone.forEach(t => parts.push(`  - [ ] ${t.title} (优先级: ${t.priority})`));
    }
  } else {
    parts.push('\n## 今日任务\n（今日无任务记录）');
  }

  // 笔记
  if (sources.notes.length > 0) {
    parts.push('\n## 今日笔记');
    sources.notes.forEach(n => {
      parts.push(`  - ${n.title || '无标题'}：${truncate(n.excerpt || '', 200)}`);
    });
  }

  // 备忘录
  if (sources.memos.length > 0) {
    parts.push('\n## 今日备忘');
    sources.memos.forEach(m => {
      parts.push(`  - ${truncate(m.excerpt || '', 200)}`);
    });
  }

  // Daily
  if (sources.daily && sources.daily.content) {
    parts.push('\n## 今日 Daily');
    parts.push(truncate(sources.daily.content, 1500));
  }

  // GitHub commits
  if (sources.commits.length > 0) {
    parts.push('\n## GitHub 提交');
    const byRepo = new Map<string, any[]>();
    sources.commits.forEach(c => {
      if (!byRepo.has(c.repoName)) byRepo.set(c.repoName, []);
      byRepo.get(c.repoName)!.push(c);
    });
    for (const [repoName, repoCommits] of byRepo) {
      parts.push(`${repoName} (${repoCommits.length} 次)：`);
      repoCommits.forEach(c => {
        parts.push(`  - ${c.shortHash} ${c.message} (改动 ${c.changedFileCount} 文件)`);
      });
    }
  } else {
    parts.push('\n## GitHub 提交\n今日未记录到提交');
  }

  let prompt = parts.join('\n');
  // 总长度限制 12000 字符
  if (prompt.length > 12000) {
    prompt = prompt.slice(0, 12000) + '\n\n...（已截断）';
  }
  return prompt;
}

export function buildSummarySystemPrompt(): string {
  return `你是我的个人工作日报助手。请只基于提供的任务、笔记、备忘录、Daily、GitHub 提交活动生成工作日报。

**规则：**
1. 只使用提供的数据，不要编造不存在的完成事项
2. 如果信息不足，明确说明"记录不足"
3. GitHub 提交摘要要简洁，只列出 repo 名、提交次数和关键 message
4. 用中文生成 Markdown 格式日报
5. 如果某个分类没有数据，对应章节写"无"或省略

**输出格式：**

# YYYY-MM-DD 工作日报

## 今日完成

## 今日进展

## GitHub 提交摘要

## 遇到的问题

## 明日计划

## 风险与待跟进`;
}
