// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import http from 'http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

async function callAi(aiBaseUrl: string, aiApiKey: string, aiModel: string, systemPrompt: string, userPrompt: string): Promise<string> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
    });
    const url = new URL(`${aiBaseUrl}/chat/completions`);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
        'Host': url.host,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      if (res.statusCode !== 200) { resolve(''); res.resume(); return; }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content || '');
        } catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.setTimeout(60000, () => { req.destroy(); resolve(''); });
    req.write(body);
    req.end();
  });
}

export async function POST(req: NextRequest) {
  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  const aiApiKey = (process.env.AI_API_KEY || '').trim();
  const aiModel = (process.env.AI_MODEL || '').trim();

  if (!aiBaseUrl || !aiApiKey || !aiModel) {
    return NextResponse.json({ error: 'AI 未配置' }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const { moduleId, courseId, moduleTitle, content } = body;
  if (!content || content.length < 20) {
    return NextResponse.json({ error: '内容太短，无法生成闪卡' });
  }

  const systemPrompt = `你是学习助手。请根据提供的课程模块内容，生成3~6对闪卡（问答对），帮助学习者巩固关键概念。

要求：
- 每对闪卡包含"问题（正面）"和"答案（背面）"
- 问题用简洁的问句，正面是"什么是X？"或"X的特点是？"等
- 答案用1~2句话精炼回答
- 不要超过6对，优先提取最重要的概念
- 只输出JSON数组，不要其他内容，格式：[{"front":"问题","back":"答案"},{"front":"...","back":"..."}]
- 用中文输出`;

  const userPrompt = `模块标题：${moduleTitle || '未命名模块'}\n\n模块内容：\n${content.slice(0, 3000)}`;

  const result = await callAi(aiBaseUrl, aiApiKey, aiModel, systemPrompt, userPrompt);
  if (!result) {
    return NextResponse.json({ error: 'AI 生成失败，请稍后重试' }, { status: 502 });
  }

  // Parse JSON
  let cards: { front: string; back: string }[] = [];
  const jsonMatch = result.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      cards = JSON.parse(jsonMatch[0]);
    } catch { /* ignore */ }
  }

  if (cards.length === 0) {
    return NextResponse.json({ error: 'AI 生成格式有误' }, { status: 422 });
  }

  // Save to DB
  const db = new Database(dbPath);
  const saved: any[] = [];
  const now = new Date().toISOString();

  for (const card of cards) {
    const id = `fc-gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO flashcards (id, user_id, course_id, module_id, front, back, tags, source, created_at, next_review_at)
      VALUES (?, 'default', ?, ?, ?, ?, 'ai生成', 'course_module', ?, ?)
    `).run(id, courseId ?? null, moduleId ?? null, card.front.trim(), card.back.trim(), now, '');
    saved.push(db.prepare('SELECT * FROM flashcards WHERE id = ?').get(id));
  }

  db.close();
  return NextResponse.json({ ok: true, cards: saved, count: saved.length });
}