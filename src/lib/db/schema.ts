import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

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
