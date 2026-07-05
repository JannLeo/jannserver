import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');
    const moduleId = searchParams.get('moduleId');
    const userId = 'default';
    const db = new Database(dbPath, { readonly: true });

    let rows: any[];
    if (moduleId) {
      rows = db.prepare(
        'SELECT * FROM learning_progress WHERE user_id = ? AND module_id = ?'
      ).all(userId, moduleId);
    } else if (courseId) {
      rows = db.prepare(
        'SELECT * FROM learning_progress WHERE user_id = ? AND course_id = ?'
      ).all(userId, courseId);
    } else {
      rows = db.prepare(
        'SELECT lp.*, c.title as course_title, cm.title as module_title FROM learning_progress lp JOIN courses c ON c.id = lp.course_id JOIN course_modules cm ON cm.id = lp.module_id WHERE lp.user_id = ? ORDER BY lp.updated_at DESC'
      ).all(userId);
    }

    db.close();
    return NextResponse.json({ progress: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { moduleId, courseId, status, masteryScore } = body;
    if (!moduleId || !courseId) {
      return NextResponse.json({ error: 'moduleId and courseId required' }, { status: 400 });
    }

    const userId = 'default';
    const db = new Database(dbPath);

    const existing = db.prepare(
      'SELECT id FROM learning_progress WHERE user_id = ? AND module_id = ?'
    ).get(userId, moduleId) as any;

    const now = new Date().toISOString();
    const completedAt = status === 'completed' ? now : null;
    const startedAt = status === 'in_progress' ? now : null;

    if (existing) {
      db.prepare(`
        UPDATE learning_progress
        SET status = COALESCE(?, status),
            mastery_score = COALESCE(?, mastery_score),
            attempts = attempts + 1,
            started_at = COALESCE(?, started_at),
            completed_at = COALESCE(?, completed_at),
            updated_at = ?
        WHERE id = ?
      `).run(status, masteryScore, startedAt, completedAt, now, existing.id);
    } else {
      db.prepare(`
        INSERT INTO learning_progress (user_id, course_id, module_id, status, mastery_score, attempts, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(userId, courseId, moduleId, status ?? 'in_progress', masteryScore ?? 0, startedAt, completedAt);
    }

    db.close();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}