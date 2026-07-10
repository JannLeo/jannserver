// src/app/api/sessions/route.ts — AI Agent Session CRUD API

import { NextRequest, NextResponse } from 'next/server';
import { getAllSessions, addSession, updateSessionStatus, deleteSession, getSessionById } from '@/lib/session-db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/sessions — 列出所有 session
export async function GET() {
  try {
    const sessions = getAllSessions();
    return NextResponse.json(sessions);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sessions — 创建新 session
export async function POST(req: NextRequest) {
  try {
    const { name, agentType, pid, socketPath } = await req.json();
    if (!name) return NextResponse.json({ error: 'name 必填' }, { status: 400 });

    const id = uuidv4();
    addSession({ id, name, agentType, pid, socketPath });
    const session = getSessionById(id);
    return NextResponse.json(session, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/sessions — 更新状态/日志
export async function PATCH(req: NextRequest) {
  try {
    const { id, status, logs } = await req.json();
    if (!id) return NextResponse.json({ error: 'id 必填' }, { status: 400 });
    if (!status && logs === undefined) return NextResponse.json({ error: 'status 或 logs 必填' }, { status: 400 });

    const existing = getSessionById(id);
    if (!existing) return NextResponse.json({ error: 'session 不存在' }, { status: 404 });

    if (status) updateSessionStatus(id, status, logs);
    else if (logs !== undefined) {
      // 只追加日志
      const newLogs = (existing.logs || '') + (logs ? '\n' + logs : '');
      updateSessionStatus(id, existing.status, newLogs);
    }

    return NextResponse.json(getSessionById(id));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/sessions — 删除 session
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 必填' }, { status: 400 });

    const existing = getSessionById(id);
    if (!existing) return NextResponse.json({ error: 'session 不存在' }, { status: 404 });

    deleteSession(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}