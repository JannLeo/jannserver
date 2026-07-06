
import { db, initDb } from '@/lib/db/index';
import { tasks } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import DashboardClient from '@/components/DashboardClient';
import { getTodayLocalDate } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  initDb();
  const today = getTodayLocalDate();

  return (
    <DashboardClient initialData={{ todayDate: today }} />
  );
}
