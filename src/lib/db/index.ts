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
  rel_path TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wiki_spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'repo',
  source_id INTEGER REFERENCES repo_sources(id),
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wiki_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES wiki_spaces(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  confidence TEXT NOT NULL DEFAULT 'medium',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wiki_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES wiki_spaces(id),
  from_page_id INTEGER NOT NULL REFERENCES wiki_pages(id),
  to_page_id INTEGER,
  link_text TEXT NOT NULL DEFAULT '',
  relation_type TEXT NOT NULL DEFAULT 'related',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wiki_error_book (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES wiki_spaces(id),
  question TEXT NOT NULL,
  failure_type TEXT NOT NULL,
  missing_concept TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_code_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repo_sources(id),
  rel_path TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  mtime TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  symbols_json TEXT NOT NULL DEFAULT '[]',
  indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repo_sources(id),
  file_id INTEGER NOT NULL REFERENCES project_code_files(id),
  symbol_type TEXT NOT NULL,
  name TEXT NOT NULL,
  signature TEXT NOT NULL DEFAULT '',
  start_line INTEGER NOT NULL DEFAULT 0,
  end_line INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
for (const stmt of createSQL.trim().split(";").filter(s => s.trim())) {
  if (stmt.trim()) sqlite.exec(stmt.trim() + ";");
}

// Indexes for repo_documents (must add after table creation)
const indexes = [
  `CREATE INDEX IF NOT EXISTS idx_repo_documents_repo_id ON repo_documents(repo_id);`,
  `CREATE INDEX IF NOT EXISTS idx_repo_documents_repo_title ON repo_documents(repo_id, title);`,
  `CREATE INDEX IF NOT EXISTS idx_repo_documents_repo_updated ON repo_documents(repo_id, updated_at);`,
  // search_fts index
  `CREATE INDEX IF NOT EXISTS idx_search_fts_doc ON search_fts(doc_type, doc_id);`,
  // wiki indexes
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_pages_space_slug ON wiki_pages(space_id, slug);`,
  `CREATE INDEX IF NOT EXISTS idx_wiki_pages_space ON wiki_pages(space_id);`,
  `CREATE INDEX IF NOT EXISTS idx_wiki_links_from ON wiki_links(from_page_id);`,
  `CREATE INDEX IF NOT EXISTS idx_wiki_error_book_unresolved ON wiki_error_book(resolved, space_id);`,
  // project_brain indexes
  `CREATE INDEX IF NOT EXISTS idx_code_files_repo ON project_code_files(repo_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_code_files_repo_path ON project_code_files(repo_id, rel_path);`,
  `CREATE INDEX IF NOT EXISTS idx_symbols_repo_name ON project_symbols(repo_id, name);`,
  `CREATE INDEX IF NOT EXISTS idx_symbols_file ON project_symbols(file_id);`,
];
for (const idx of indexes) {
  sqlite.exec(idx);
}

const db = drizzle(sqlite, { schema });

export function initDb() {}

export { db, sqlite };
