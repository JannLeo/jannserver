import { db, initDb } from '@/lib/db/index';
import { notes, tasks, memos, repoSources, repoDocuments } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import NavBar from '@/components/NavBar';
import DashboardClient from '@/components/DashboardClient';
import { getRepoActivity, getTodayLocalDate } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  initDb();

  const today = getTodayLocalDate();

  // 今日任务：scheduled_date = today 或 status = 'todo' 且未安排
  const todayTasks = db.select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    priority: tasks.priority,
    scheduledDate: tasks.scheduledDate,
    completedAt: tasks.completedAt,
  })
    .from(tasks)
    .where(sql`${tasks.scheduledDate} = ${today} OR (${tasks.status} = 'todo' AND ${tasks.scheduledDate} IS NULL)`)
    .orderBy(tasks.priority, desc(tasks.updatedAt))
    .limit(15)
    .all();

  // 未完成任务
  const undoneTasks = db.select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    priority: tasks.priority,
  })
    .from(tasks)
    .where(sql`${tasks.status} IN ('todo', 'in_progress')`)
    .orderBy(desc(tasks.updatedAt))
    .limit(8)
    .all();

  // 最近笔记
  const recentNotes = db.select({
    id: notes.id,
    title: notes.title,
    slug: notes.slug,
    updatedAt: notes.updatedAt,
  }).from(notes).orderBy(desc(notes.updatedAt)).limit(5).all();

  // 最近备忘录
  const recentMemos = db.select({
    id: memos.id,
    slug: memos.slug,
    excerpt: memos.excerpt,
    updatedAt: memos.updatedAt,
  }).from(memos).orderBy(desc(memos.updatedAt)).limit(5).all();

  // GitHub repos 状态 + 文档数
  const repos = db.select().from(repoSources).all();
  const repoStats = repos.map(r => {
    const docCount = db.select().from(repoDocuments)
      .where(eq(repoDocuments.repoId, r.id)).all().length;
    return {
      id: r.id,
      name: r.name,
      lastSyncAt: r.lastSyncAt,
      documentCount: docCount,
    };
  });

  const data = {
    todayDate: today,
    todayTasks: todayTasks as any[],
    undoneTasks: undoneTasks as any[],
    recentNotes: recentNotes as any[],
    recentMemos: recentMemos as any[],
    repos: repoStats,
  };

  // GitHub 今日提交活动（失败不阻塞 Dashboard）
  let activity: { repos: any[]; totalCommits: number } = { repos: [], totalCommits: 0 };
  try {
    const a = await getRepoActivity(today);
    activity = { repos: a.repos, totalCommits: a.totalCommits };
  } catch {
    // keep empty default
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="个人工作台" />
      <DashboardClient data={data} activity={activity} />
    </div>
  );
}
