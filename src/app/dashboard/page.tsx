import { db, initDb } from '@/lib/db/index';
import { tasks as tasksTable } from '@/lib/db/schema';
import { getTodayLocalDate } from '@/lib/activity';
import DashboardClient from '@/components/DashboardClient';
import * as fs from 'fs';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  initDb();
  const today = getTodayLocalDate();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Server-side fetch: tasks
  const allTasks = db.select().from(tasksTable).all();
  // 今日任务：排除昨天已完成的任务（已完成的任务在日期过后不再出现在今日）
  const todayTasks = allTasks.filter(t => {
    if (t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) < today) return false;
    if (!t.scheduledDate) return true;
    return t.scheduledDate === today;
  });

  // 已整合仓库：从 tasks 表取所有 AI 整合完成的任务
  const integratedTasks = db.select().from(tasksTable).all().filter(t =>
    t.source === 'ai' && t.status === 'done' && t.tags && t.tags.includes('integration')
  );

  // 扫描 src/app/ 下存在的整合页面目录
  const appDir = '/home/sz/workspace/src/app';
  const integratedRepos = integratedTasks
    .map(t => {
      const repoName = t.title.replace('🤖 整合: ', '').trim();
      const safeName = repoName.replace(/[^a-zA-Z0-9]/g, '_');
      const pagePath = `${appDir}/${safeName}/page.tsx`;
      return { name: repoName, safeName, pagePath, exists: fs.existsSync(pagePath) };
    })
    .filter(r => r.exists)
    .slice(0, 10);

  return (
    <DashboardClient
      initialData={{
        todayDate: today,
        todayTasks,
        allTasks,
        integratedRepos,
      }}
    />
  );
}
