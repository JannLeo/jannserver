import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

export async function GET() {
  try {
    const db = new Database(dbPath, { readonly: true });

    const courses = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id) as module_count
      FROM courses c
      ORDER BY c."order" ASC
    `).all();

    db.close();
    return NextResponse.json({ courses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, category, difficulty, icon, color } = body;
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

    const db = new Database(dbPath);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    db.prepare(`
      INSERT INTO courses (id, title, description, category, difficulty, icon, color, is_built_in, "order")
      VALUES (?, ?, ?, ?, ?, ?, ?, 0,
        (SELECT COALESCE(MAX("order"), 0) + 1 FROM courses))
    `).run(id, title, description ?? '', category ?? '', difficulty ?? 'beginner', icon ?? '📚', color ?? '#3b82f6');

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
    db.close();

    return NextResponse.json({ course }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}