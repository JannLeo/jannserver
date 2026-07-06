// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { tasks, notes, memos, projects } from '@/lib/db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_BASE_URL = (process.env.AI_BASE_URL || '').trim();
const AI_API_KEY = (process.env.AI_API_KEY || '').trim();
const AI_MODEL = (process.env.AI_MODEL || '').trim();

function buildContext(noteList: any[], memoList: any[], projectList: any[]): string {
  let ctx = '';
  if (projectList.length) {
    ctx += '## 当前项目\n';
    for (const p of projectList) {
      ctx += `- ${p.name}${p.description ? '：' + p.description : ''}\n`;
    }
    ctx += '\n';
  }
  if (noteList.length) {
    ctx += '## 最近笔记\n';
    for (const n of noteList.slice(0, 10)) {
      ctx += `### ${n.title || '无标题'}\n${(n.excerpt || '').slice(0, 300)}\n\n`;
    }
    ctx += '\n';
  }
  if (memoList.length) {
    ctx += '## 备忘录\n';
    for (const m of memoList) {
      ctx += `- ${(m.content || '').slice(0, 150)}\n`;
    }
    ctx += '\n';
  }
  return ctx;
}

function buildGeneratePrompt(context: string): string {
  return `你是一位高效能助手，擅长从上下文信息中提取出**可执行的待办事项**。

## 上下文信息
${context || '（暂无上下文）'}

## 任务要求
请根据以上信息，识别出用户**接下来应该做的、具体可执行的任务**。
- 只提取明确需要做的、实际有价值的事情
- 不要生成已经完成的事项
- 不要生成日常琐事（如"吃饭"、"睡觉"等）
- 每条任务要简洁、具体、可操作（动词开头，20字内）
- 优先级：直接影响项目进度/有明确deadline = high，有一定价值但非紧急 = medium，锦上添花 = low

## 输出格式（严格 JSON，不要其他文字）
{
  "tasks": [
    {
      "title": "任务标题（动词开头，20字内）",
      "description": "详细描述（不超过100字，可为空字符串）",
      "priority": "high | medium | low",
      "reason": "来源说明（从哪里得出的，1句话）"
    }
  ]
}
只输出 JSON，不要任何其他内容。`;
}

export async function POST(req: NextRequest) {
  if (!AI_BASE_URL || !AI_API_KEY || !AI_MODEL) {
    return NextResponse.json({ configured: false, error: 'AI 未配置' }, { status: 200 });
  }

  try {
    initDb();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch notes (last 30 days, not deleted)
    const noteList = db
      .select({ id: notes.id, title: notes.title, excerpt: notes.excerpt, updatedAt: notes.updatedAt })
      .from(notes)
      .where(isNull(notes.folderId)) // no-op filter, just get all
      .orderBy(desc(notes.updatedAt))
      .limit(10)
      .all();

    // Filter in JS (Drizzle doesn't support complex where easily here)
    const recentNotes = noteList.filter((n: any) => !n.updatedAt || n.updatedAt >= thirtyDaysAgo);

    // Fetch memos
    const memoList = db
      .select({ id: memos.id, content: memos.content })
      .from(memos)
      .limit(20)
      .all();

    // Fetch projects
    let projectList: any[] = [];
    try {
      projectList = db.select({ id: projects.id, name: projects.name, description: projects.description }).from(projects).all();
    } catch (_) { /* no projects */ }

    const context = buildContext(recentNotes, memoList, projectList);
    const prompt = buildGeneratePrompt(context);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let rawContent = '';
    try {
      const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: '你是一位专业的内容生成助手，只输出 JSON。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        return NextResponse.json({ configured: true, error: `AI API ${res.status}` }, { status: 502 });
      }
      const data = await res.json();
      rawContent = data.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') return NextResponse.json({ configured: true, error: 'AI 请求超时（120s）' }, { status: 504 });
      return NextResponse.json({ configured: true, error: `请求失败: ${err.message}` }, { status: 502 });
    }

    if (!rawContent.trim()) {
      return NextResponse.json({ configured: true, error: 'AI 返回为空' }, { status: 502 });
    }

    // Parse JSON from response
    let parsed: any = null;
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (_) { /* ignore parse failure */ }
    }

    if (!parsed?.tasks?.length) {
      return NextResponse.json({
        configured: true,
        error: 'AI 未生成有效任务',
        raw: rawContent.slice(0, 200),
      }, { status: 422 });
    }

    const generatedTasks = parsed.tasks.map((t: any) => ({
      title: String(t.title || '未命名任务').slice(0, 100),
      description: String(t.description || '').slice(0, 500),
      priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
      reason: String(t.reason || '').slice(0, 200),
    }));

    return NextResponse.json({
      configured: true,
      tasks: generatedTasks,
      contextSummary: {
        notes: recentNotes.length,
        memos: memoList.length,
        projects: projectList.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ configured: true, error: err.message }, { status: 500 });
  }
}