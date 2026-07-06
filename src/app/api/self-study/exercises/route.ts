import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const moduleId = searchParams.get('module_id');
  const courseId = searchParams.get('course_id');
  const limit = parseInt(searchParams.get('limit') || '10');

  try {
    const db = new Database(dbPath, { readonly: true });

    let rows: any[];
    if (moduleId) {
      rows = db.prepare(`
        SELECT id, module_id, question_type, question, options,
               difficulty, correct_answer, explanation
        FROM module_exercises
        WHERE module_id = ?
        ORDER BY RANDOM()
        LIMIT ?
      `).all(moduleId, limit);
    } else if (courseId) {
      rows = db.prepare(`
        SELECT e.id, e.module_id, e.question_type, e.question, e.options,
               e.difficulty, e.explanation, cm.title as module_title
        FROM module_exercises e
        JOIN course_modules cm ON cm.id = e.module_id
        WHERE cm.course_id = ?
        ORDER BY cm."order", RANDOM()
      `).all(courseId);
    } else {
      db.close();
      return NextResponse.json({ error: 'module_id or course_id required' }, { status: 400 });
    }

    // Parse options JSON
    const result = rows.map(r => ({ ...r, options: JSON.parse(r.options as string) }));
    db.close();
    return NextResponse.json({ exercises: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}