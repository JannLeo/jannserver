import { db, initDb } from '@/lib/db/index';
import { tasks, notes, memos, repoSources, repoDocuments } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import DashboardClient from '@/components/DashboardClient';
import { getRepoActivity, getTodayLocalDate } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  initDb();
  const today = getTodayLocalDate();

  // 今日任务
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
    repos: repoStats,
  };

  let activity: { repos: any[]; totalCommits: number } = { repos: [], totalCommits: 0 };
  try {
    const a = await getRepoActivity(today);
    activity = { repos: a.repos, totalCommits: a.totalCommits };
  } catch {}

  return (
    <DashboardClient data={data} activity={activity} />
  );
}