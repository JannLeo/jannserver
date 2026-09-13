// lib/session-db.ts — AI Agent Session Manager SQLite layer
// Uses its own SQLite file while sharing the configured data directory.

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const mainDbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), 'data', 'app.db');
const dbPath = process.env.SESSIONS_DB_PATH
  ? path.resolve(process.env.SESSIONS_DB_PATH)
  : path.join(path.dirname(mainDbPath), 'sessions.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const MAX_LOG_CHARS = 1_000_000;

const SESSION_STATUSES = new Set(['idle', 'running', 'blocked', 'done', 'error']);

function assertStatus(status: string): asserts status is AgentSession['status'] {
  if (!SESSION_STATUSES.has(status)) throw new Error('Invalid agent session status');
}

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
  CREATE INDEX IF NOT EXISTS idx_as_updated ON agent_sessions(updated_at);
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
  status?: AgentSession['status'];
  agentType?: string;
  pid?: string;
  socketPath?: string;
  logs?: string;
}) {
  const status = session.status || 'idle';
  assertStatus(status);
  return db
    .prepare(
      `INSERT INTO agent_sessions (id, name, status, agent_type, pid, socket_path, logs)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      session.id,
      session.name,
      status,
      session.agentType || 'claude',
      session.pid || null,
      session.socketPath || null,
      (session.logs || '').slice(-MAX_LOG_CHARS),
    );
}

export function updateSessionStatus(id: string, status: string, logEntry?: string) {
  assertStatus(status);
  if (logEntry !== undefined && logEntry !== '') {
    return db
      .prepare(
        `UPDATE agent_sessions
         SET status = ?,
             logs = substr(logs || ? || '\n', -?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(status, logEntry, MAX_LOG_CHARS, id);
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
    .prepare(`SELECT id, name, status, agent_type as agentType, pid, socket_path as socketPath, logs, created_at as createdAt, updated_at as updatedAt FROM agent_sessions ORDER BY updated_at DESC`)
    .all() as AgentSession[];
}

export function getSessionById(id: string): AgentSession | undefined {
  return db
    .prepare(`SELECT id, name, status, agent_type as agentType, pid, socket_path as socketPath, logs, created_at as createdAt, updated_at as updatedAt FROM agent_sessions WHERE id = ?`)
    .get(id) as AgentSession | undefined;
}

export default db;
