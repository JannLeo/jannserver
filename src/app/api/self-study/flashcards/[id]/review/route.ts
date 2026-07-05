import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

/**
 * SM-2 Spaced Repetition Algorithm (simplified)
 * quality: 0=blackout, 1=forgot, 2=hard, 3=ok, 4=easy, 5=perfect
 *
 * Returns { interval, easeFactor, repetitions, nextReviewAt }
 */
function sm2(q: number, prevInterval: number, prevEaseFactor: number, prevReps: number) {
  let ef = prevEaseFactor;
  let rep = prevReps;
  let interval = prevInterval;

  if (q >= 3) {
    // Correct response
    if (rep === 0) interval = 1;
    else if (rep === 1) interval = 6;
    else interval = Math.round(prevInterval * ef);
    rep += 1;
  } else {
    // Failed: reset
    rep = 0;
    interval = 1;
  }

  // Update ease factor
  ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);
  const nextReviewAtStr = nextReviewAt.toISOString();

  return { interval, easeFactor: Math.round(ef * 100) / 100, repetitions: rep, nextReviewAt: nextReviewAtStr };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await _req.json();
    const { quality, responseTimeMs } = body;
    const flashcardId = params.id;

    const q = Math.max(0, Math.min(5, Number(quality) | 0));
    const db = new Database(dbPath);

    const card = db.prepare('SELECT * FROM flashcards WHERE id = ?').get(flashcardId) as any;
    if (!card) {
      db.close();
      return NextResponse.json({ error: 'Flashcard not found' }, { status: 404 });
    }

    const { interval, easeFactor, repetitions, nextReviewAt } = sm2(
      q,
      card.interval,
      card.ease_factor,
      card.repetitions
    );

    db.prepare(`
      UPDATE flashcards
      SET ease_factor = ?, interval = ?, repetitions = ?, next_review_at = ?, updated_at = ?
      WHERE id = ?
    `).run(easeFactor, interval, repetitions, nextReviewAt, new Date().toISOString(), flashcardId);

    db.prepare(`
      INSERT INTO flashcard_reviews (flashcard_id, quality, response_time_ms)
      VALUES (?, ?, ?)
    `).run(flashcardId, q, responseTimeMs ?? 0);

    db.close();
    return NextResponse.json({ ok: true, nextReviewAt, interval, easeFactor, repetitions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}