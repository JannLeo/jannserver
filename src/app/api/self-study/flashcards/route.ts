import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const due = searchParams.get('due') === 'true';
    const courseId = searchParams.get('courseId');
    const userId = 'default';
    const db = new Database(dbPath, { readonly: true });

    let rows: any[];
    const now = new Date().toISOString();

    if (due) {
      // Due flashcards: next_review_at is empty or <= now, or due_date <= now
      rows = db.prepare(`
        SELECT f.* FROM flashcards f
        WHERE f.user_id = ?
        AND (f.next_review_at = '' OR f.next_review_at <= ?)
        ORDER BY f.next_review_at ASC
      `).all(userId, now);
    } else if (courseId) {
      rows = db.prepare(
        'SELECT * FROM flashcards WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC'
      ).all(userId, courseId);
    } else {
      rows = db.prepare(
        'SELECT f.*, c.title as course_title FROM flashcards f LEFT JOIN courses c ON c.id = f.course_id WHERE f.user_id = ? ORDER BY f.created_at DESC'
      ).all(userId);
    }

    // Stats
    const totalCards = (db.prepare('SELECT COUNT(*) as count FROM flashcards WHERE user_id = ?').get(userId) as any).count;
    const dueCards = due ? rows.length : (db.prepare("SELECT COUNT(*) as count FROM flashcards WHERE user_id = ? AND (next_review_at = '' OR next_review_at <= ?)").get(userId, now) as any).count;

    db.close();
    return NextResponse.json({ flashcards: rows, stats: { total: totalCards, due: dueCards } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { front, back, courseId, moduleId, tags } = body;
    if (!front || !back) {
      return NextResponse.json({ error: 'front and back required' }, { status: 400 });
    }

    const db = new Database(dbPath);
    const id = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    db.prepare(`
      INSERT INTO flashcards (id, user_id, course_id, module_id, front, back, tags, source)
      VALUES (?, 'default', ?, ?, ?, ?, ?, 'manual')
    `).run(id, courseId ?? null, moduleId ?? null, front, back, tags ?? '');

    const card = db.prepare('SELECT * FROM flashcards WHERE id = ?').get(id);
    db.close();

    return NextResponse.json({ flashcard: card }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}