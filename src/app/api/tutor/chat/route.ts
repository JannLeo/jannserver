// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db/index';
import { db } from '@/lib/db/index';
import { sql } from 'drizzle-orm';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_BASE_URL = (process.env.AI_BASE_URL || 'http://127.0.0.1:12345/v1').trim();
const AI_MODEL = (process.env.AI_MODEL || 'MiniMax-M2.7').trim();
const PROXY_URL = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';

let _agent: any = null;
function getAgent() {
  if (!_agent) _agent = new HttpsProxyAgent(PROXY_URL);
  return _agent;
}

// ── Socratic Tutor System Prompt ─────────────────────────────────────
const SOCRATIC_SYSTEM = `You are **Sarah**, a patient and encouraging English tutor for students preparing for China's **00015 Self-Study Undergraduate English Exam** (equivalent to CET-4 level). Your teaching method is **strictly Socratic**.

## Your Core Rules
1. **NEVER give direct answers.** Guide students to discover answers themselves.
2. When a student answers correctly: praise specifically, then ask a follow-up to deepen understanding.
3. When a student is wrong: don't say "wrong". Instead, ask a leading question to redirect their thinking.
4. After 2+ wrong attempts: give a **hint** (still not the full answer), then ask them to try again.
5. After 3 failed attempts: briefly explain the concept, then ask a similar follow-up question.
6. Keep responses concise: 2-4 sentences per turn. Be warm and supportive.
7. Use Chinese to explain grammar rules when helpful. Use English for vocabulary and reading practice.
8. When student asks about the same concept 2+ times, acknowledge their effort and offer a clearer mini-explanation.

## Response Format
- Start with the Socratic response.
- If you gave a hint or mini-explanation, note it quietly (e.g., "[Hint: ...]" — don't show this, it's for internal tracking).
- The response must feel like a natural conversation, not a lecture.

## Context
- Student's current topic: {module_topic}
- Course: 00015 自考英语（一） / CET-4 Level English
- Exam: 150 minutes, 100 points total. Passing score: 60 points.
- Modules: 发音字母、语法框架、动词时态、阅读技巧、写作、词汇

## Tutor Identity
You are Sarah. Warm. Patient. Always encouraging. Your nickname is 小萨.
When the student greets you in Chinese, greet them warmly back in Chinese, then switch to English practice mode.
Never break character. Always stay in the Socratic role.`;

function getModuleSystemPrompt(moduleTitle: string, moduleContent: string): string {
  return SOCRATIC_SYSTEM.replace('{module_topic}', moduleTitle) + `

## Current Module Content
Here is the study material for the current module: """${moduleContent.slice(0, 3000)}"""

When the student asks about a topic covered in this material, use it as the basis for your Socratic guidance.
If they are practicing a specific question from the material, use the content to verify their answer (but still don't give the answer directly).`;
}

// ── AI Call ────────────────────────────────────────────────────────────
async function callAI(messages: { role: string; content: string }[]): Promise<{ answer: string; error?: string }> {
  const aiApiKey = process.env.AI_API_KEY || '';
  if (!aiApiKey) return { answer: 'AI未配置API密钥', error: 'no_key' };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
      signal: controller.signal,
      // @ts-ignore
      agent: getAgent(),
    });

    clearTimeout(timeout);
    if (!res.ok) throw new Error(`AI API error: ${res.status}`);
    const data = await res.json();
    return { answer: data.choices?.[0]?.message?.content || '' };
  } catch (err: any) {
    if (err.name === 'AbortError') return { answer: '请求超时（120秒）', error: 'timeout' };
    return { answer: `AI请求失败: ${err.message}`, error: err.message };
  }
}

// ── POST /api/tutor/chat ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sessionId, message, userId = 'default' } = body;
  if (!sessionId || !message) {
    return NextResponse.json({ error: 'sessionId 和 message 是必填项' }, { status: 400 });
  }

  initDb();

  // ── 1. Load session & module info ─────────────────────────────────
  let session: any, moduleContent = '', moduleTitle = '综合英语';
  try {
    const rows = db.all(sql`
      SELECT s.*, m.title as module_title, m.content as module_content
      FROM tutor_sessions s
      LEFT JOIN course_modules m ON m.id = s.module_id
      WHERE s.id = ${sessionId} AND s.user_id = ${userId}
    `);
    session = rows[0];
    if (!session) return NextResponse.json({ error: 'Session不存在' }, { status: 404 });
    moduleTitle = session.module_title || '英语学习';
    moduleContent = session.module_content || '';
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // ── 2. Load conversation history ──────────────────────────────────
  let history: { role: string; content: string }[] = [];
  try {
    const msgs = db.all(sql`
      SELECT role, content FROM tutor_messages
      WHERE session_id = ${sessionId}
      ORDER BY id ASC
    `);
    history = msgs.map((m: any) => ({ role: m.role, content: m.content }));
  } catch {}

  // ── 3. Build messages for AI ───────────────────────────────────────
  const systemMsg = getModuleSystemPrompt(moduleTitle, moduleContent);
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemMsg },
    ...history,
    { role: 'user', content: message },
  ];

  // ── 4. Call AI ────────────────────────────────────────────────────
  const { answer, error } = await callAI(messages);
  if (error && error !== 'timeout') {
    return NextResponse.json({ error: answer }, { status: 500 });
  }

  const now = new Date().toISOString();

  // ── 5. Save messages to DB ────────────────────────────────────────
  try {
    db.run(sql`INSERT INTO tutor_messages (session_id, role, content, created_at, is_socratic)
      VALUES (${sessionId}, 'user', ${message}, ${now}, 0)`);
    db.run(sql`INSERT INTO tutor_messages (session_id, role, content, created_at, is_socratic)
      VALUES (${sessionId}, 'assistant', ${answer}, ${now}, 1)`);
    db.run(sql`UPDATE tutor_sessions
      SET updated_at=${now}, message_count=message_count+2
      WHERE id=${sessionId}`);
  } catch (e: any) {
    console.error('DB write error:', e.message);
  }

  return NextResponse.json({ answer, sessionId });
}