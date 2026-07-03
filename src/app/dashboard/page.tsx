import { redirect } from 'next/navigation';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/auth';
import { db, initDb } from '@/lib/db/index';
import { notes, tasks, memos, dailyPages } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
import { eq, desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { format } from 'date-fns';
import NavBar from '@/components/NavBar';
import AskSection from '@/components/AskSection';

export default async function DashboardPage() {
  const initDb = (await import('@/lib/db/index')).initDb;
  initDb();

  const today = format(new Date(), 'yyyy-MM-dd');

  const recentNotes = db.select({
    id: notes.id, title: notes.title, slug: notes.slug, updatedAt: notes.updatedAt,
  }).from(notes).orderBy(desc(notes.updatedAt)).limit(5).all();

  const todayTasks = db.select({ id: tasks.id, title: tasks.title, status: tasks.status, priority: tasks.priority })
    .from(tasks)
    .where(sql`${tasks.scheduledDate} = ${today} OR ${tasks.status} = 'todo'`)
    .orderBy(tasks.priority, desc(tasks.updatedAt))
    .limit(10)
    .all();

  const undoneTasks = db.select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks).where(sql`${tasks.status} IN ('todo', 'in_progress')`)
    .orderBy(desc(tasks.updatedAt)).limit(8).all();

  const recentMemos = db.select({ id: memos.id, slug: memos.slug, excerpt: memos.excerpt, updatedAt: memos.updatedAt })
    .from(memos).orderBy(desc(memos.updatedAt)).limit(5).all();

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title="个人工作台" />

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 今日待办 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">📋 今日待办</h2>
            <Link href="/tasks/today" className="text-sm text-blue-500 hover:underline">查看全部</Link>
          </div>
          {todayTasks.length === 0 ? (
            <p className="text-slate-400 text-sm">今日暂无任务 → <Link href="/tasks" className="text-blue-500">去创建</Link></p>
          ) : (
            <ul className="space-y-2">
              {todayTasks.map(t => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${t.status === 'done' ? 'bg-green-400' : t.status === 'in_progress' ? 'bg-yellow-400' : 'bg-slate-300'}`} />
                  <span className={`text-sm ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>{t.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 快速入口 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h2 className="font-semibold text-lg mb-4">⚡ 快速新建</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['/notes/new', '📝', '新建笔记'],
              ['/memos?new=1', '💡', '新建备忘录'],
              ['/tasks?new=1', '✅', '新建任务'],
              ['/daily', '📅', '今日 Daily'],
              ['/projects?new=1', '📁', '新建项目'],
              ['/settings', '⚙️', '设置'],
            ].map(([href, icon, label]) => (
              <Link key={href} href={href} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition text-center">
                <span className="text-xl">{icon}</span>
                <span className="text-xs text-slate-600">{label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* 最近笔记 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">📝 最近笔记</h2>
            <Link href="/notes" className="text-sm text-blue-500 hover:underline">全部</Link>
          </div>
          {recentNotes.length === 0 ? (
            <p className="text-slate-400 text-sm">暂无笔记</p>
          ) : (
            <ul className="space-y-2">
              {recentNotes.map(n => (
                <li key={n.id}>
                  <Link href={`/notes/${n.slug}`} className="text-sm text-slate-700 hover:text-blue-600 hover:underline">
                    {n.title}
                  </Link>
                  <span className="text-xs text-slate-400 ml-2">{format(new Date(n.updatedAt!), 'MM-dd HH:mm')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 未完成任务 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">⏳ 未完成任务</h2>
            <Link href="/tasks" className="text-sm text-blue-500 hover:underline">全部</Link>
          </div>
          {undoneTasks.length === 0 ? (
            <p className="text-slate-400 text-sm">🎉 所有任务已完成！</p>
          ) : (
            <ul className="space-y-2">
              {undoneTasks.map(t => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="text-sm">{t.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

      </main>

      <div className="max-w-6xl mx-auto px-6 pb-6">
        <AskSection />
      </div>
    </div>
  );
}