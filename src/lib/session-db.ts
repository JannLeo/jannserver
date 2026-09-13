// lib/session-db.ts — AI Agent Session Manager SQLite 层
// 独立 DB 文件，不侵入 data/app.db 的已有 schema

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'sessions.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    agent_type TEXT NOT NULL DEFAULT 'claude',
    pid TEXT,
    socket_path TEXT,
    logs TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_as_status ON agent_sessions(status);
`);

export type AgentSession = {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'blocked' | 'done' | 'error';
  agentType: string;
  pid?: string;
  socketPath?: string;
  logs?: string;
  createdAt: string;
  updatedAt: string;
};

export function addSession(session: {
  id: string;
  name: string;
  status?: string;
  agentType?: string;
  pid?: string;
  socketPath?: string;
  logs?: string;
}) {
  return db
    .prepare(
      `INSERT OR REPLACE INTO agent_sessions (id, name, status, agent_type, pid, socket_path, logs)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      session.id,
      session.name,
      session.status || 'idle',
      session.agentType || 'claude',
      session.pid || null,
      session.socketPath || null,
      session.logs || ''
    );
}

export function updateSessionStatus(id: string, status: string, logs?: string) {
  if (logs !== undefined) {
    return db
      .prepare(
        `UPDATE agent_sessions SET status = ?, logs = logs || ? || '\n', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .run(status, logs, id);
  }
  return db
    .prepare(`UPDATE agent_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(status, id);
}

export function deleteSession(id: string) {
  return db.prepare(`DELETE FROM agent_sessions WHERE id = ?`).run(id);
}

export function getAllSessions(): AgentSession[] {
  return db
    .prepare(`SELECT id, name, status, agent_type as agentType, pid, socket_path as socketPath, logs, created_at as createdAt, updated_at as updatedAt FROM agent_sessions ORDER BY created_at DESC`)
    .all() as AgentSession[];
}

export function getSessionById(id: string): AgentSession | undefined {
  return db
    .prepare(`SELECT id, name, status, agent_type as agentType, pid, socket_path as socketPath, logs, created_at as createdAt, updated_at as updatedAt FROM agent_sessions WHERE id = ?`)
    .get(id) as AgentSession | undefined;
}

export default db;