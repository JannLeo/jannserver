// @ts-nocheck
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = process.env.DB_PATH || "./data/app.db";
const absPath = path.resolve(dbPath);
const dir = path.dirname(absPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sqlite = new Database(absPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const createSQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#3b82f6',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  file_path TEXT DEFAULT '',
  excerpt TEXT DEFAULT '',
  folder_id INTEGER,
  project_id TEXT,
  tags TEXT NOT NULL DEFAULT '',
  is_todo_extracted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS note_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL REFERENCES notes(id),
  tag_id TEXT NOT NULL REFERENCES tags(id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  project_id TEXT,
  tags TEXT DEFAULT '',
  due_date TEXT,
  scheduled_date TEXT,
  note_slug TEXT,
  source TEXT DEFAULT 'manual',
  completed_at TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS task_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  tag_id TEXT NOT NULL REFERENCES tags(id)
);
CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  file_path TEXT DEFAULT '',
  excerpt TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  pinned INTEGER DEFAULT 0,
  project_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memo_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memo_id TEXT NOT NULL REFERENCES memos(id),
  tag_id TEXT NOT NULL REFERENCES tags(id)
);
CREATE TABLE IF NOT EXISTS daily_pages (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  content TEXT DEFAULT '',
  file_path TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS search_fts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS login_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  attempt_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS repo_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  local_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS repo_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repo_sources(id),
  file_path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
for (const stmt of createSQL.trim().split(";").filter(s => s.trim())) {
  if (stmt.trim()) sqlite.exec(stmt.trim() + ";");
}

const db = drizzle(sqlite, { schema });

export function initDb() {}

export { db, sqlite };
