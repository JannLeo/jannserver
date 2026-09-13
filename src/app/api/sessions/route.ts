// src/app/api/sessions/route.ts — AI Agent Session CRUD API

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllSessions,
  addSession,
  updateSessionStatus,
  deleteSession,
  getSessionById,
  type AgentSession,
} from '@/lib/session-db';
import { v4 as uuidv4 } from 'uuid';

const SESSION_STATUSES = new Set<AgentSession['status']>(['idle', 'running', 'blocked', 'done', 'error']);
const AGENT_TYPE_RE = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_LOG_ENTRY = 100_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// GET /api/sessions — 列出所有 session
export async function GET() {
  try {
    return NextResponse.json(getAllSessions());
  } catch (error: unknown) {
    console.error('[api/sessions] list failed', error);
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
  }
}

// POST /api/sessions — 创建新 session
export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const agentType = typeof body.agentType === 'string' && body.agentType.trim()
      ? body.agentType.trim()
      : 'claude';
    const pid = body.pid === undefined || body.pid === null ? undefined : String(body.pid).trim();
    const socketPath = typeof body.socketPath === 'string' ? body.socketPath.trim() : undefined;

    if (!name) return NextResponse.json({ error: 'name 必填' }, { status: 400 });
    if (name.length > 200) return NextResponse.json({ error: 'name 过长' }, { status: 400 });
    if (!AGENT_TYPE_RE.test(agentType)) {
      return NextResponse.json({ error: '无效的 agentType' }, { status: 400 });
    }
    if (pid && !/^\d{1,20}$/.test(pid)) {
      return NextResponse.json({ error: '无效的 pid' }, { status: 400 });
    }
    if (socketPath && socketPath.length > 1024) {
      return NextResponse.json({ error: 'socketPath 过长' }, { status: 400 });
    }

    const id = uuidv4();
    addSession({ id, name, agentType, pid, socketPath });
    return NextResponse.json(getSessionById(id), { status: 201 });
  } catch (error: unknown) {
    console.error('[api/sessions] create failed', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

// PATCH /api/sessions — 更新状态/日志
export async function PATCH(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
    }

    const id = typeof body.id === 'string' ? body.id : '';
    const status = typeof body.status === 'string' ? body.status : undefined;
    const logs = typeof body.logs === 'string' ? body.logs : body.logs === undefined ? undefined : null;

    if (!id) return NextResponse.json({ error: 'id 必填' }, { status: 400 });
    if (!status && logs === undefined) {
      return NextResponse.json({ error: 'status 或 logs 必填' }, { status: 400 });
    }
    if (status && !SESSION_STATUSES.has(status as AgentSession['status'])) {
      return NextResponse.json({ error: '无效的 session 状态' }, { status: 400 });
    }
    if (logs === null) return NextResponse.json({ error: 'logs 必须是字符串' }, { status: 400 });
    if (logs !== undefined && logs.length > MAX_LOG_ENTRY) {
      return NextResponse.json({ error: '单次日志过长' }, { status: 413 });
    }

    const existing = getSessionById(id);
    if (!existing) return NextResponse.json({ error: 'session 不存在' }, { status: 404 });

    updateSessionStatus(id, status || existing.status, logs);
    return NextResponse.json(getSessionById(id));
  } catch (error: unknown) {
    console.error('[api/sessions] update failed', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

// DELETE /api/sessions — 删除 session
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 必填' }, { status: 400 });

    const existing = getSessionById(id);
    if (!existing) return NextResponse.json({ error: 'session 不存在' }, { status: 404 });

    deleteSession(id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('[api/sessions] delete failed', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
