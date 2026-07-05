import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category'); // 'all' | 'programming' | 'web' | 'ml' | 'linux'
    const userId = 'default';
    const db = new Database(dbPath, { readonly: true });

    let courses: any[];
    if (category && category !== 'all') {
      courses = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id) as module_count,
          (SELECT COUNT(*) FROM learning_progress lp JOIN course_modules cm ON cm.id = lp.module_id WHERE cm.course_id = c.id AND lp.status = 'completed' AND lp.user_id = ?) as completed_count
        FROM courses c
        WHERE c.category = ?
        ORDER BY c."order" ASC
      `).all(userId, category);
    } else {
      courses = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id) as module_count,
          (SELECT COUNT(*) FROM learning_progress lp JOIN course_modules cm ON cm.id = lp.module_id WHERE cm.course_id = c.id AND lp.status = 'completed' AND lp.user_id = ?) as completed_count
        FROM courses c
        ORDER BY c."order" ASC
      `).all(userId);
    }

    db.close();

    // Calculate progress %
    courses = courses.map((c: any) => ({
      ...c,
      progress: c.module_count > 0 ? Math.round((c.completed_count / c.module_count) * 100) : 0,
    }));

    return NextResponse.json({ courses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}