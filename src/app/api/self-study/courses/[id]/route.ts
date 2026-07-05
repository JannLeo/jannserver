import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const courseId = params.id;

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    if (!course) {
      db.close();
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const modules = db.prepare(`
      SELECT cm.*,
        COALESCE(lp.status, 'not_started') as status,
        COALESCE(lp.mastery_score, 0) as mastery_score,
        COALESCE(lp.attempts, 0) as attempts
      FROM course_modules cm
      LEFT JOIN learning_progress lp
        ON lp.module_id = cm.id AND lp.user_id = 'default'
      WHERE cm.course_id = ?
      ORDER BY cm."order" ASC
    `).all(courseId);

    // Completion stats
    const total = modules.length;
    const completed = (modules as any[]).filter(m => m.status === 'completed').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    db.close();
    return NextResponse.json({ course, modules, stats: { total, completed, progress } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}