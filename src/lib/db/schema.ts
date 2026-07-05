import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const folders = sqliteTable("folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  parentId: integer("parent_id"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").default(""),
  color: text("color").default("#3b82f6"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull().default(""),
  filePath: text("file_path").default(""),
  excerpt: text("excerpt").default(""),
  folderId: integer("folder_id").references(() => folders.id),
  projectId: text("project_id").references(() => projects.id),
  tags: text("tags").notNull().default(""),
  isTodoExtracted: integer("is_todo_extracted", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const noteTags = sqliteTable("note_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: text("note_id").notNull().references(() => notes.id),
  tagId: text("tag_id").notNull().references(() => tags.id),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  projectId: text("project_id").references(() => projects.id),
  tags: text("tags").default(""),
  dueDate: text("due_date"),
  scheduledDate: text("scheduled_date"),
  noteSlug: text("note_slug"),
  source: text("source").default("manual"),
  completedAt: text("completed_at"),
  order: integer("order").default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const taskTags = sqliteTable("task_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: text("task_id").notNull().references(() => tasks.id),
  tagId: text("tag_id").notNull().references(() => tags.id),
});

export const memos = sqliteTable("memos", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().default(""),
  content: text("content").notNull(),
  filePath: text("file_path").default(""),
  excerpt: text("excerpt").default(""),
  tags: text("tags").default(""),
  pinned: integer("pinned", { mode: "boolean" }).default(false),
  projectId: text("project_id").references(() => projects.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const memoTags = sqliteTable("memo_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memoId: text("memo_id").notNull().references(() => memos.id),
  tagId: text("tag_id").notNull().references(() => tags.id),
});

export const dailyPages = sqliteTable("daily_pages", {
  id: text("id").primaryKey(),
  date: text("date").notNull().unique(),
  content: text("content").default(""),
  filePath: text("file_path").default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// tags table (exported as 'tags' for route compatibility)
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").default("#6366f1"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const searchFts = sqliteTable("search_fts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docType: text("doc_type").notNull(),
  docId: text("doc_id").notNull(),
  title: text("title").notNull().default(""),
  content: text("content").notNull().default(""),
});

export const repoSources = sqliteTable("repo_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  branch: text("branch").notNull().default("main"),
  localPath: text("local_path").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSyncAt: text("last_sync_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const repoDocuments = sqliteTable("repo_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repoId: integer("repo_id").notNull().references(() => repoSources.id),
  filePath: text("file_path").notNull(),
  title: text("title").notNull().default(""),
  relPath: text("rel_path").notNull().default(""),
  contentHash: text("content_hash").notNull(),
  content: text("content").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── LLM-Wiki 知识层 ───────────────────────────────────────────────────────
export const wikiSpaces = sqliteTable("wiki_spaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull().default("repo"),
  sourceId: integer("source_id").references(() => repoSources.id),
  description: text("description").default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const wikiPages = sqliteTable("wiki_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spaceId: integer("space_id").notNull().references(() => wikiSpaces.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  summary: text("summary").default(""),
  content: text("content").notNull().default(""),
  aliasesJson: text("aliases_json").notNull().default("[]"),
  tagsJson: text("tags_json").notNull().default("[]"),
  sourceRefsJson: text("source_refs_json").notNull().default("[]"),
  confidence: text("confidence").notNull().default("medium"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const wikiLinks = sqliteTable("wiki_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spaceId: integer("space_id").notNull().references(() => wikiSpaces.id),
  fromPageId: integer("from_page_id").notNull().references(() => wikiPages.id),
  toPageId: integer("to_page_id"),
  linkText: text("link_text").notNull().default(""),
  relationType: text("relation_type").notNull().default("related"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const wikiErrorBook = sqliteTable("wiki_error_book", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spaceId: integer("space_id").references(() => wikiSpaces.id),
  question: text("question").notNull(),
  failureType: text("failure_type").notNull(),
  missingConcept: text("missing_concept").default(""),
  notes: text("notes").default(""),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── Project Brain ───────────────────────────────────────────────────────────
export const projectCodeFiles = sqliteTable("project_code_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repoId: integer("repo_id").notNull().references(() => repoSources.id),
  relPath: text("rel_path").notNull(),
  language: text("language").notNull().default(""),
  contentHash: text("content_hash").notNull().default(""),
  sizeBytes: integer("size_bytes").notNull().default(0),
  mtime: text("mtime").notNull().default(""),
  summary: text("summary").notNull().default(""),
  symbolsJson: text("symbols_json").notNull().default("[]"),
  indexedAt: text("indexed_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const projectSymbols = sqliteTable("project_symbols", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repoId: integer("repo_id").notNull().references(() => repoSources.id),
  fileId: integer("file_id").notNull().references(() => projectCodeFiles.id),
  symbolType: text("symbol_type").notNull(),
  name: text("name").notNull(),
  signature: text("signature").notNull().default(""),
  startLine: integer("start_line").notNull().default(0),
  endLine: integer("end_line").notNull().default(0),
  summary: text("summary").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── Project Ontology ────────────────────────────────────────────────────────
export const ontologyEntities = sqliteTable("ontology_entities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repoId: integer("repo_id").notNull().references(() => repoSources.id),
  entityType: text("entity_type").notNull(),
  name: text("name").notNull(),
  canonicalName: text("canonical_name").notNull(),
  aliasesJson: text("aliases_json").notNull().default("[]"),
  sourceType: text("source_type").notNull().default(""),
  sourceId: text("source_id").notNull().default(""),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const ontologyRelations = sqliteTable("ontology_relations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repoId: integer("repo_id").notNull().references(() => repoSources.id),
  fromEntityId: integer("from_entity_id").notNull().references(() => ontologyEntities.id),
  relationType: text("relation_type").notNull(),
  toEntityId: integer("to_entity_id").notNull().references(() => ontologyEntities.id),
  confidence: text("confidence").notNull().default("medium"),
  sourceRefsJson: text("source_refs_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── Video Analysis ───────────────────────────────────────────────────────────
export const videoAnalysisJobs = sqliteTable("video_analysis_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  platform: text("platform").notNull(),
  crawlType: text("crawl_type").notNull().default("search"),
  keyword: text("keyword").notNull().default(""),
  targetUrl: text("target_url").notNull().default(""),
  targetId: text("target_id").notNull().default(""),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  message: text("message").notNull().default(""),
  resultCount: integer("result_count").notNull().default(0),
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
  finishedAt: text("finished_at"),
});

export const videoAnalysisItems = sqliteTable("video_analysis_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().references(() => videoAnalysisJobs.id),
  platform: text("platform").notNull().default(""),
  itemType: text("item_type").notNull().default("video"),
  sourceId: text("source_id").notNull().default(""),
  title: text("title").notNull().default(""),
  authorName: text("author_name").notNull().default(""),
  publishTime: text("publish_time").notNull().default(""),
  url: text("url").notNull().default(""),
  content: text("content").notNull().default(""),
  rawJson: text("raw_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const videoAnalysisReports = sqliteTable("video_analysis_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().references(() => videoAnalysisJobs.id),
  title: text("title").notNull().default(""),
  markdown: text("markdown").notNull().default(""),
  sourcesJson: text("sources_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const embeddings = sqliteTable("embeddings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docType: text("doc_type").notNull(),
  docId: text("doc_id").notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  content: text("content").notNull().default(""),
  embeddingJson: text("embedding_json").notNull().default("[]"),
  model: text("model").notNull().default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const kbSources = sqliteTable("kb_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceType: text("source_type").notNull(),
  name: text("name").notNull(),
  vaultPath: text("vault_path").notNull().default(""),
  fileCount: integer("file_count").notNull().default(0),
  lastSyncAt: text("last_sync_at"),
  fileMapJson: text("file_map_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── WorldQuant BRAIN ────────────────────────────────────────────────────────
export const brainAlphas = sqliteTable("brain_alphas", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default(""),
  stage: text("stage").notNull().default(""),
  grade: text("grade").notNull().default(""),
  type: text("type").notNull().default(""),
  expression: text("expression").notNull().default(""),
  settingsJson: text("settings_json").notNull().default("{}"),
  sharpe: text("sharpe").notNull().default(""),
  fitness: text("fitness").notNull().default(""),
  turnover: text("turnover").notNull().default(""),
  returns: text("returns").notNull().default(""),
  drawdown: text("drawdown").notNull().default(""),
  margin: text("margin").notNull().default(""),
  pnl: text("pnl").notNull().default(""),
  bookSize: text("book_size").notNull().default(""),
  longCount: integer("long_count").notNull().default(0),
  shortCount: integer("short_count").notNull().default(0),
  startDate: text("start_date").notNull().default(""),
  checksJson: text("checks_json").notNull().default("[]"),
  dateSubmitted: text("date_submitted"),
  selfCorrMax: text("self_corr_max"),
  rawJson: text("raw_json").notNull().default("{}"),
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const brainUserInfo = sqliteTable("brain_user_info", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().default(""),
  email: text("email").notNull().default(""),
  displayName: text("display_name").notNull().default(""),
  rawJson: text("raw_json").notNull().default("{}"),
  lastSyncAt: text("last_sync_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const novels = sqliteTable("novels", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("未命名小说"),
  author: text("author").notNull().default(""),
  genre: text("genre").notNull().default(""),
  synopsis: text("synopsis").notNull().default(""),
  worldSetting: text("world_setting").notNull().default(""),   // 世界观
  genreSetting: text("genre_setting").notNull().default(""),   // 题材设定
  characterSettings: text("character_settings").notNull().default(""), // 角色设定 JSON
  currentPhase: text("current_phase").notNull().default("setup"), // setup | outline | draft | review | archive
  currentChapter: integer("current_chapter").notNull().default(0),
  totalWords: integer("total_words").notNull().default(0),
  wordCountTarget: integer("word_count_target").notNull().default(300000),
  status: text("status").notNull().default("writing"), // writing | paused | finished
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const novelChapters = sqliteTable("novel_chapters", {
  id: text("id").primaryKey(),
  novelId: text("novel_id").notNull().references(() => novels.id),
  volumeNumber: integer("volume_number").notNull().default(1),
  chapterNumber: integer("chapter_number").notNull().default(1),
  title: text("title").notNull().default(""),
  outline: text("outline").notNull().default(""),     // 章纲
  content: text("content").notNull().default(""),   // 正文
  wordCount: integer("word_count").notNull().default(0),
  status: text("status").notNull().default("outline"), // outline | draft | reviewing | done
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const novelVolumes = sqliteTable("novel_volumes", {
  id: text("id").primaryKey(),
  novelId: text("novel_id").notNull().references(() => novels.id),
  volumeNumber: integer("volume_number").notNull().default(1),
  title: text("title").notNull().default(""),
  synopsis: text("synopsis").notNull().default(""),
  outline: text("outline").notNull().default(""),
  wordCountTarget: integer("word_count_target").notNull().default(50000),
  status: text("status").notNull().default("planning"), // planning | writing | done
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── Books / Reading ──────────────────────────────────────────────────────────
export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull().default(""),
  isbn: text("isbn"),
  publisher: text("publisher").default(""),
  coverUrl: text("cover_url").default(""),
  epubUrl: text("epub_url").default(""),
  epubPath: text("epub_path").default(""),
  description: text("description").default(""),
  totalPages: integer("total_pages"),
  totalWords: integer("total_words"),
  language: text("language").default("en"),
  source: text("source").notNull().default("openlibrary"),
  wereadId: text("weread_id"),
  addedAt: text("added_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const readingProgress = sqliteTable("reading_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: text("book_id").notNull().references(() => books.id),
  userId: text("user_id").notNull().default("default"),
  currentCfi: text("current_cfi").default(""),
  currentPage: integer("current_page").default(0),
  progressPercent: real("progress_percent").default(0),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const bookHighlights = sqliteTable("book_highlights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: text("book_id").notNull().references(() => books.id),
  cfiRange: text("cfi_range").default(""),
  chapterHref: text("chapter_href").default(""),
  highlightedText: text("highlighted_text").notNull(),
  note: text("note").default(""),
  noteId: text("note_id").references((): any => notes.id),
  color: text("color").notNull().default("yellow"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});
