// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db/index';
import { db } from '@/lib/db/index';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tutor/sessions?course_id=eng-101
// POST /api/tutor/session
// GET /api/tutor/session/history?session_id=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('course_id');
  const sessionId = searchParams.get('session_id');

  if (sessionId) {
    // Fetch conversation history
    try {
      initDb();
      const messages = db.all(sql`
        SELECT role, content, is_socratic, created_at
        FROM tutor_messages
        WHERE session_id = ${sessionId}
        ORDER BY id ASC
      `);
      return NextResponse.json({ messages });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (!courseId) return NextResponse.json({ error: 'course_id or session_id required' }, { status: 400 });

  try {
    initDb();
    const sessions = db.all(sql`
      SELECT id, module_id, created_at, updated_at, message_count,
             mastery_score, current_topic, status
      FROM tutor_sessions
      WHERE user_id=${'default'} AND course_id=${courseId}
      ORDER BY updated_at DESC
      LIMIT 20
    `);
    return NextResponse.json({ sessions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { courseId, moduleId, userId = 'default' } = await req.json();
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 });

  try {
    initDb();
    const id = `tutor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    db.run(sql`
      INSERT INTO tutor_sessions (id, user_id, course_id, module_id, created_at, updated_at, message_count, mastery_score, status)
      VALUES (${id}, ${userId}, ${courseId}, ${moduleId || null}, ${now}, ${now}, 0, 0, 'active')
    `);

    return NextResponse.json({ id, courseId, moduleId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}