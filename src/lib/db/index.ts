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
CREATE TABLE IF NOT EXISTS ontology_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repo_sources(id),
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ontology_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repo_sources(id),
  from_entity_id INTEGER NOT NULL REFERENCES ontology_entities(id),
  relation_type TEXT NOT NULL,
  to_entity_id INTEGER NOT NULL REFERENCES ontology_entities(id),
  confidence TEXT NOT NULL DEFAULT 'medium',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS video_analysis_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  crawl_type TEXT NOT NULL DEFAULT 'search',
  keyword TEXT NOT NULL DEFAULT '',
  target_url TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  result_count INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS video_analysis_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES video_analysis_jobs(id),
  platform TEXT NOT NULL DEFAULT '',
  item_type TEXT NOT NULL DEFAULT 'video',
  source_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  publish_time TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS video_analysis_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES video_analysis_jobs(id),
  title TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  embedding_json TEXT NOT NULL DEFAULT '[]',
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kb_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  vault_path TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  file_map_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS brain_alphas (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  expression TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL DEFAULT '{}',
  sharpe TEXT NOT NULL DEFAULT '',
  fitness TEXT NOT NULL DEFAULT '',
  turnover TEXT NOT NULL DEFAULT '',
  returns TEXT NOT NULL DEFAULT '',
  drawdown TEXT NOT NULL DEFAULT '',
  margin TEXT NOT NULL DEFAULT '',
  pnl TEXT NOT NULL DEFAULT '',
  book_size TEXT NOT NULL DEFAULT '',
  long_count INTEGER NOT NULL DEFAULT 0,
  short_count INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL DEFAULT '',
  checks_json TEXT NOT NULL DEFAULT '[]',
  date_submitted TEXT,
  self_corr_max TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS brain_user_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS novels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '未命名小说',
  author TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  synopsis TEXT NOT NULL DEFAULT '',
  world_setting TEXT NOT NULL DEFAULT '',
  genre_setting TEXT NOT NULL DEFAULT '',
  character_settings TEXT NOT NULL DEFAULT '',
  current_phase TEXT NOT NULL DEFAULT 'setup',
  current_chapter INTEGER NOT NULL DEFAULT 0,
  total_words INTEGER NOT NULL DEFAULT 0,
  word_count_target INTEGER NOT NULL DEFAULT 300000,
  status TEXT NOT NULL DEFAULT 'writing',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS novel_chapters (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  volume_number INTEGER NOT NULL DEFAULT 1,
  chapter_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT '',
  outline TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'outline',
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS novel_volumes (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  volume_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT '',
  synopsis TEXT NOT NULL DEFAULT '',
  outline TEXT NOT NULL DEFAULT '',
  word_count_target INTEGER NOT NULL DEFAULT 50000,
  status TEXT NOT NULL DEFAULT 'planning',
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  // ontology indexes
  `CREATE INDEX IF NOT EXISTS idx_ontology_entities_repo_type ON ontology_entities(repo_id, entity_type);`,
  `CREATE INDEX IF NOT EXISTS idx_ontology_entities_canonical ON ontology_entities(canonical_name);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ontology_entities_repo_type_canonical ON ontology_entities(repo_id, entity_type, canonical_name);`,
  `CREATE INDEX IF NOT EXISTS idx_ontology_relations_type ON ontology_relations(relation_type);`,
  `CREATE INDEX IF NOT EXISTS idx_ontology_relations_from ON ontology_relations(from_entity_id);`,
  `CREATE INDEX IF NOT EXISTS idx_ontology_relations_to ON ontology_relations(to_entity_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ontology_relations_triple ON ontology_relations(from_entity_id, relation_type, to_entity_id);`,
  // video_analysis indexes
  `CREATE INDEX IF NOT EXISTS idx_va_items_job ON video_analysis_items(job_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_va_reports_job ON video_analysis_reports(job_id);`,
  // embeddings indexes
  `CREATE INDEX IF NOT EXISTS idx_embeddings_doc ON embeddings(doc_type, doc_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_doc_chunk ON embeddings(doc_type, doc_id, chunk_index);`,
  `CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model);`,
  // kb_sources indexes
  `CREATE INDEX IF NOT EXISTS idx_kb_sources_type_name ON kb_sources(source_type, name);`,
  // brain indexes
  `CREATE INDEX IF NOT EXISTS idx_brain_alphas_status ON brain_alphas(status);`,
  `CREATE INDEX IF NOT EXISTS idx_brain_alphas_synced ON brain_alphas(synced_at);`,
  // novel indexes
  `CREATE INDEX IF NOT EXISTS idx_novels_updated ON novels(updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_novel_chapters_novel ON novel_chapters(novel_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_novel_chapters_number ON novel_chapters(novel_id, chapter_number);`,
  `CREATE INDEX IF NOT EXISTS idx_novel_chapters_volume ON novel_chapters(novel_id, volume_number, chapter_number);`,
  `CREATE INDEX IF NOT EXISTS idx_novel_volumes_novel ON novel_volumes(novel_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_novel_volumes_number ON novel_volumes(novel_id, volume_number);`,
];
for (const idx of indexes) {
  sqlite.exec(idx);
}

const db = drizzle(sqlite, { schema });

export function initDb() {}

export { db, sqlite };