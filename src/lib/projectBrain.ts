/**
 * Project Brain 项目级知识库
 *
 * 在 wiki_pages（概念页）之上，为项目代码/文档/commit 提供项目级 wiki 页面。
 *
 * pageType 分类（存 wiki_pages.tags_json 中以 `pageType:xxx` 形式）：
 *   - project_overview  项目总览
 *   - module_summary    模块汇总（第一版：1 个汇总页，不拆单模块）
 *   - feature_summary   功能说明（第一版不主动编译，留接口位）
 *   - config_summary    配置项汇总
 *   - commit_summary    最近提交摘要
 *   - bug_history / decision_record / test_summary / code_symbol (留接口位)
 *
 * search_fts 集成：
 *   doc_type='project_wiki'
 *   doc_id=String(pageId)（不带字符串前缀）
 *   删除/更新时调 deleteFtsByDoc('project_wiki', String(pageId)) 精确双键删除。
 *
 * 数据采集原则：不把完整代码文件塞进 prompt。优先用：
 *   - 文件路径
 *   - symbols (name + signature + line)
 *   - 文件摘要 (buildFileSummary)
 *   - 关键片段（match 命中行附近 ±N 行）
 *   - README/SPEC markdown 摘要
 *   - git commit message
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import * as crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db, sqlite } from './db/index';
import {
  repoSources,
  repoDocuments,
  wikiSpaces,
  wikiPages,
  projectCodeFiles,
  projectSymbols,
} from './db/schema';
import { eq, and, like, or } from 'drizzle-orm';
import { updateFts, deleteFtsByDoc } from './search';
import { extractSymbols, buildFileSummary, detectLanguage } from './projectSymbols';
import { isPathUnderReposBase } from './paths';
import { getAllowedModes, getRepoProfile } from './projectBrainConfig';

const execFileAsync = promisify(execFile);
const path = nodePath;

// ─── 常量 ────────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 200 * 1024; // 200KB

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'venv', '.venv', 'site-packages', 'site_packages',
  'build', 'dist', '.next', 'output', 'out', 'vendor', 'third_party',
  '__pycache__', '.cache', '.deps', 'target', '.tox', '.eggs',
  'ENV', 'env', '.svn',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.c', '.h', '.cpp', '.cc', '.hpp',
  '.py',
  '.ts', '.tsx', '.js', '.jsx',
  '.json', '.yaml', '.yml',
]);

export type ProjectPageType =
  | 'project_overview'
  | 'module_summary'
  | 'feature_summary'
  | 'config_summary'
  | 'commit_summary'
  | 'bug_history'
  | 'decision_record'
  | 'test_summary'
  | 'code_symbol';

export type CompileMode = 'overview' | 'modules' | 'configs' | 'commits' | 'all';

export interface ScanResult {
  ok: boolean;
  repoId: number;
  scanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  skippedLargeFiles: number;
  removed: number;
  reason?: string;
}

export interface CompilePageResult {
  ok: boolean;
  pageId?: number;
  mode?: CompileMode;
  pageType?: ProjectPageType;
  confidence?: string;
  sourceCount?: number;
  reason?: string;
  alreadyExists?: boolean;
}

export interface ProjectContext {
  repoId: number;
  repoName: string;
  repoPath: string;
}

// ─── 基础工具 ────────────────────────────────────────────────────────────────

/**
 * 获取 repo 上下文：repoId + repoName + repoPath
 * 校验 repo_sources.local_path 必须在 REPOS_BASE_DIR 下。
 */
export function getProjectContext(repoName: string): ProjectContext | null {
  const repoRow = db.select().from(repoSources).all().find((r: any) => r.name === repoName) as any;
  if (!repoRow) return null;
  const localPath = String(repoRow.localPath || '');
  if (!localPath) return null;
  if (!isPathUnderReposBase(localPath)) return null;
  let realPath: string;
  try {
    realPath = fs.realpathSync(localPath);
  } catch {
    return null;
  }
  if (!fs.existsSync(realPath)) return null;
  return {
    repoId: repoRow.id,
    repoName: repoRow.name,
    repoPath: realPath,
  };
}

/**
 * 获取或创建 project wiki space（source_type='project'）
 */
export function getOrCreateProjectSpace(repoName: string, repoId?: number): number {
  // 若提供 repoId，先按 source_id 查；否则按 name 查
  const repoRow = repoId
    ? (db.select().from(repoSources).where(eq(repoSources.id, repoId)).get() as any)
    : (db.select().from(repoSources).all().find((r: any) => r.name === repoName) as any);
  const sourceId = repoRow?.id ?? null;

  const existing = db
    .select()
    .from(wikiSpaces)
    .where(
      sourceId
        ? and(eq(wikiSpaces.sourceType, 'project'), eq(wikiSpaces.sourceId, sourceId))
        : and(eq(wikiSpaces.sourceType, 'project'), eq(wikiSpaces.name, repoName))
    )
    .all() as any[];

  if (existing.length > 0) return existing[0].id;

  const now = new Date().toISOString();
  const result = db
    .insert(wikiSpaces)
    .values({
      name: repoName,
      sourceType: 'project',
      sourceId,
      description: `Project Brain space for ${repoName}`,
      createdAt: now,
      updatedAt: now,
    })
    .run() as any;
  return Number(result.lastInsertRowid);
}

// ─── 代码扫描 ────────────────────────────────────────────────────────────────

function scanCodeFilesRecursive(dir: string, base: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      scanCodeFilesRecursive(full, base, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;
      out.push(full);
    }
  }
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

/**
 * 扫描 repo 下所有代码文件，写入 project_code_files + project_symbols。
 * 跳过 >200KB 的文件并在返回结果中统计 skippedLargeFiles。
 */
export async function scanCodeFiles(opts: {
  repoId: number;
  repoPath: string;
}): Promise<ScanResult> {
  const { repoId, repoPath } = opts;
  const allFiles: string[] = [];
  scanCodeFilesRecursive(repoPath, repoPath, allFiles);

  // 取出当前 DB 中已有文件列表（用于检测删除）
  const existingFiles = db
    .select({ id: projectCodeFiles.id, relPath: projectCodeFiles.relPath, contentHash: projectCodeFiles.contentHash })
    .from(projectCodeFiles)
    .where(eq(projectCodeFiles.repoId, repoId))
    .all() as any[];
  const existingMap = new Map<string, { id: number; contentHash: string }>();
  for (const e of existingFiles) existingMap.set(e.relPath, { id: e.id, contentHash: e.contentHash });

  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let skippedLargeFiles = 0;
  const seenRelPaths = new Set<string>();
  const now = new Date().toISOString();

  for (const abs of allFiles) {
    scanned++;
    const relPath = path.relative(repoPath, abs).split(path.sep).join('/');
    seenRelPaths.add(relPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      skipped++;
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) {
      skippedLargeFiles++;
      continue;
    }
    let content = '';
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      skipped++;
      continue;
    }
    const hash = computeHash(content);
    const ext = path.extname(abs).toLowerCase();
    const language = detectLanguage(relPath);
    const mtime = stat.mtime.toISOString();
    const summary = buildFileSummary(content);
    const symbols = extractSymbols(language, content);
    const symbolsJson = JSON.stringify(
      symbols.map((s) => ({
        symbolType: s.symbolType,
        name: s.name,
        signature: s.signature,
        startLine: s.startLine,
        endLine: s.endLine,
      }))
    );

    const existing = existingMap.get(relPath);
    if (existing && existing.contentHash === hash) {
      // 内容没变，跳过
      continue;
    }

    if (existing) {
      // 更新文件记录
      db.update(projectCodeFiles)
        .set({
          language,
          contentHash: hash,
          sizeBytes: stat.size,
          mtime,
          summary,
          symbolsJson,
          indexedAt: now,
        })
        .where(eq(projectCodeFiles.id, existing.id))
        .run();
      // 删旧 symbols，插新
      db.delete(projectSymbols).where(eq(projectSymbols.fileId, existing.id)).run();
      for (const s of symbols) {
        db.insert(projectSymbols)
          .values({
            repoId,
            fileId: existing.id,
            symbolType: s.symbolType,
            name: s.name,
            signature: s.signature,
            startLine: s.startLine,
            endLine: s.endLine,
            summary: '',
            createdAt: now,
          })
          .run();
      }
      updated++;
    } else {
      // 新增文件记录
      const ins = db
        .insert(projectCodeFiles)
        .values({
          repoId,
          relPath,
          language,
          contentHash: hash,
          sizeBytes: stat.size,
          mtime,
          summary,
          symbolsJson,
          indexedAt: now,
        })
        .run() as any;
      const fileId = Number(ins.lastInsertRowid);
      for (const s of symbols) {
        db.insert(projectSymbols)
          .values({
            repoId,
            fileId,
            symbolType: s.symbolType,
            name: s.name,
            signature: s.signature,
            startLine: s.startLine,
            endLine: s.endLine,
            summary: '',
            createdAt: now,
          })
          .run();
      }
      inserted++;
    }
    // 避免 ext 空变量告警
    void ext;
  }

  // 删除 DB 中已不存在的文件
  let removed = 0;
  const existingEntries = Array.from(existingMap.entries());
  for (const [relPath, info] of existingEntries) {
    if (!seenRelPaths.has(relPath)) {
      db.delete(projectSymbols).where(eq(projectSymbols.fileId, info.id)).run();
      db.delete(projectCodeFiles).where(eq(projectCodeFiles.id, info.id)).run();
      removed++;
    }
  }

  return { ok: true, repoId, scanned, inserted, updated, skipped, skippedLargeFiles, removed };
}

// ─── Commit History ──────────────────────────────────────────────────────────

export interface CommitHistoryEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  changedFiles: string[];
}

/**
 * 查询 repo 最近 N 天 / N 条 commit history。
 * 注意：这与 activity.ts 中按 date 查询的 getRepoActivity 不同。
 */
export async function getRepoCommitHistory(
  repoId: number,
  days = 30,
  maxCount = 100
): Promise<CommitHistoryEntry[]> {
  const repoRow = db.select().from(repoSources).where(eq(repoSources.id, repoId)).get() as any;
  if (!repoRow || !repoRow.localPath) return [];
  if (!isPathUnderReposBase(repoRow.localPath)) return [];
  let realPath: string;
  try {
    realPath = fs.realpathSync(repoRow.localPath);
  } catch {
    return [];
  }
  if (!fs.existsSync(path.join(realPath, '.git'))) return [];

  try {
    const since = `${days} days ago`;
    const { stdout } = await execFileAsync(
      'git',
      [
        'log',
        `--since=${since}`,
        `--max-count=${maxCount}`,
        '--pretty=format:%H%x09%an%x09%ad%x09%s',
        '--date=iso',
        '--name-only',
      ],
      { cwd: realPath, maxBuffer: 5 * 1024 * 1024, timeout: 10_000 }
    );
    const commits: CommitHistoryEntry[] = [];
    const blocks = stdout.split(/\n\n/);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      const [hash, author, date, message] = lines[0].split('\t');
      if (!hash) continue;
      const changedFiles = lines.slice(1).map((l) => l.trim()).filter(Boolean);
      commits.push({
        hash,
        shortHash: hash.slice(0, 7),
        author,
        date,
        message,
        changedFiles,
      });
    }
    return commits;
  } catch {
    return [];
  }
}

// ─── 源采集 ──────────────────────────────────────────────────────────────────

interface CodeFileSummary {
  fileId: number;
  relPath: string;
  language: string;
  sizeBytes: number;
  summary: string;
  symbols: { symbolType: string; name: string; signature: string; startLine: number; endLine: number }[];
}

interface RepoDocSummary {
  docId: number;
  relPath: string;
  title: string;
  excerpt: string;
}

interface ProjectSources {
  codeFiles: CodeFileSummary[];
  repoDocs: RepoDocSummary[];
  recentCommits: CommitHistoryEntry[];
}

/**
 * 收集项目源（代码文件摘要 + repo_documents 摘要 + 最近 commit）。
 * 不读取完整代码内容，仅返回摘要 + symbols + 路径。
 */
export async function collectProjectSources(repoName: string, repoId: number): Promise<ProjectSources> {
  // 1. 代码文件
  const codeFileRows = db
    .select()
    .from(projectCodeFiles)
    .where(eq(projectCodeFiles.repoId, repoId))
    .all() as any[];
  const codeFiles: CodeFileSummary[] = codeFileRows.map((r: any) => {
    let symbols: any[] = [];
    try {
      symbols = JSON.parse(r.symbolsJson || '[]');
    } catch {}
    return {
      fileId: r.id,
      relPath: r.relPath,
      language: r.language,
      sizeBytes: r.sizeBytes,
      summary: r.summary,
      symbols: symbols.slice(0, 30), // 单文件最多 30 个符号，避免 prompt 过大
    };
  });

  // 2. repo_documents
  const docRows = db
    .select({ id: repoDocuments.id, relPath: repoDocuments.relPath, title: repoDocuments.title, content: repoDocuments.content })
    .from(repoDocuments)
    .where(eq(repoDocuments.repoId, repoId))
    .all() as any[];
  const repoDocs: RepoDocSummary[] = docRows.map((r: any) => ({
    docId: r.id,
    relPath: r.relPath,
    title: r.title,
    excerpt: String(r.content || '').slice(0, 400),
  }));

  // 3. 最近 commit
  const recentCommits = await getRepoCommitHistory(repoId, 30, 100);

  return { codeFiles, repoDocs, recentCommits };
}

// ─── 搜索 ────────────────────────────────────────────────────────────────────

export interface ProjectWikiMatch {
  id: number;
  spaceId: number;
  slug: string;
  title: string;
  summary: string;
  content: string;
  pageType: string;
  confidence: string;
  score: number;
}

/**
 * 在指定 project wiki space 内搜索 wiki_pages。
 * 可选 pageTypes 过滤（tags_json 中含 `pageType:xxx`）。
 */
export function searchProjectWiki(
  spaceId: number,
  terms: string[],
  pageTypes?: string[]
): ProjectWikiMatch[] {
  if (terms.length === 0) return [];
  const scored: ProjectWikiMatch[] = [];

  try {
    const allPages = db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.spaceId, spaceId))
      .all() as any[];

    for (const page of allPages) {
      let pageType = 'concept';
      try {
        const tags: string[] = JSON.parse(page.tagsJson || '[]');
        const ptTag = tags.find((t) => t.startsWith('pageType:'));
        if (ptTag) pageType = ptTag.split(':')[1];
      } catch {}
      if (pageTypes && pageTypes.length > 0 && !pageTypes.includes(pageType)) continue;

      let score = 0;
      const titleLower = String(page.title || '').toLowerCase();
      const summaryLower = String(page.summary || '').toLowerCase();
      const contentLower = String(page.content || '').toLowerCase();

      for (const term of terms) {
        const t = term.toLowerCase();
        if (!t || t.length < 2) continue;
        if (titleLower === t) score += 100;
        else if (titleLower.includes(t)) score += 50;
        if (summaryLower.includes(t)) score += 20;
        if (contentLower.includes(t)) score += 10;
      }

      if (score > 0) {
        scored.push({
          id: page.id,
          spaceId: page.spaceId,
          slug: page.slug,
          title: page.title,
          summary: page.summary,
          content: page.content,
          pageType,
          confidence: page.confidence,
          score,
        });
      }
    }
  } catch (err) {
    console.error('[projectBrain] searchProjectWiki error:', err);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
}

export interface CodeSymbolMatch {
  type: 'symbol' | 'file';
  fileId: number;
  relPath: string;
  language: string;
  symbolName?: string;
  symbolType?: string;
  signature?: string;
  startLine?: number;
  endLine?: number;
  summary?: string;
  score: number;
}

/**
 * 搜索代码符号/文件：先按符号名 LIKE，再按文件 relPath / summary LIKE。
 * 不读取文件内容（性能）。
 */
export function searchCodeSymbols(repoId: number, terms: string[]): CodeSymbolMatch[] {
  if (terms.length === 0) return [];
  const scored: CodeSymbolMatch[] = [];

  try {
    // 1. 符号名匹配
    for (const term of terms) {
      if (!term || term.length < 2) continue;
      const pattern = `%${term}%`;
      const symRows = db
        .select({
          id: projectSymbols.id,
          fileId: projectSymbols.fileId,
          symbolType: projectSymbols.symbolType,
          name: projectSymbols.name,
          signature: projectSymbols.signature,
          startLine: projectSymbols.startLine,
          endLine: projectSymbols.endLine,
        })
        .from(projectSymbols)
        .where(and(eq(projectSymbols.repoId, repoId), like(projectSymbols.name, pattern)))
        .limit(40)
        .all() as any[];

      const fileIdSet = new Set(symRows.map((r: any) => r.fileId));
      const fileMap = new Map<number, any>();
      if (fileIdSet.size > 0) {
        const fileRows = db
          .select()
          .from(projectCodeFiles)
          .where(eq(projectCodeFiles.repoId, repoId))
          .all() as any[];
        for (const f of fileRows) {
          if (fileIdSet.has(f.id)) fileMap.set(f.id, f);
        }
      }

      for (const s of symRows) {
        const f = fileMap.get(s.fileId);
        if (!f) continue;
        const nameLower = String(s.name).toLowerCase();
        let score = 10;
        if (nameLower === term.toLowerCase()) score += 80;
        else if (nameLower.startsWith(term.toLowerCase())) score += 40;
        scored.push({
          type: 'symbol',
          fileId: s.fileId,
          relPath: f.relPath,
          language: f.language,
          symbolName: s.name,
          symbolType: s.symbolType,
          signature: s.signature,
          startLine: s.startLine,
          endLine: s.endLine,
          score,
        });
      }
    }

    // 2. 文件 relPath / summary 匹配
    const fileRows = db
      .select()
      .from(projectCodeFiles)
      .where(eq(projectCodeFiles.repoId, repoId))
      .all() as any[];
    for (const f of fileRows) {
      let score = 0;
      const relPathLower = String(f.relPath).toLowerCase();
      const summaryLower = String(f.summary || '').toLowerCase();
      for (const term of terms) {
        const t = term.toLowerCase();
        if (!t || t.length < 2) continue;
        if (relPathLower.includes(t)) score += 20;
        if (summaryLower.includes(t)) score += 10;
      }
      if (score > 0) {
        scored.push({
          type: 'file',
          fileId: f.id,
          relPath: f.relPath,
          language: f.language,
          summary: f.summary,
          score,
        });
      }
    }
  } catch (err) {
    console.error('[projectBrain] searchCodeSymbols error:', err);
  }

  // 去重：同 (fileId + symbolName) 保留最高分
  const seen = new Map<string, CodeSymbolMatch>();
  for (const m of scored) {
    const key = `${m.type}:${m.fileId}:${m.symbolName || ''}`;
    if (!seen.has(key) || seen.get(key)!.score < m.score) {
      seen.set(key, m);
    }
  }
  const result = Array.from(seen.values());
  result.sort((a, b) => b.score - a.score);
  return result.slice(0, 20);
}

// ─── AI 编译 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是项目知识库的 wiki 编译者。
基于提供的「项目源（代码文件摘要、符号表、文档摘要、commit 历史）」为指定模式生成结构化 wiki 页。

严格规则：
1. 只能依据提供的源生成，不得编造文件路径、函数名、配置值、commit hash
2. source_refs 中每条必须映射回输入的某条源（docId / relPath / commitHash）
3. 若源不足，confidence 必须为 'low'
4. content 必须用 markdown，按 mode 的模板组织小节
5. 输出严格 JSON，字段：
   title(string), summary(string, <=120字), content(string, markdown),
   tags(string[], 必须包含 "pageType:xxx" 标记),
   source_refs([{kind:"code"|"doc"|"commit", ref:string, excerpt:string}]),
   confidence('high' | 'medium' | 'low')

不要输出 JSON 以外的文本。`;

function parseAiJson(text: string): any | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  return null;
}

function buildSourcesBlock(sources: ProjectSources, maxLen = 8000): string {
  const parts: string[] = [];

  // 代码文件摘要（不放完整内容）
  const codeLines: string[] = [];
  for (const f of sources.codeFiles.slice(0, 80)) {
    const symStr = f.symbols
      .slice(0, 10)
      .map((s) => `    L${s.startLine}-${s.endLine} ${s.symbolType} ${s.name}${s.signature ? ' ' + s.signature : ''}`)
      .join('\n');
    codeLines.push(`### Code: ${f.relPath} (${f.language}, ${f.sizeBytes}B)
summary: ${f.summary || '(empty)'}
symbols:
${symStr || '    (none)'}`);
  }
  if (codeLines.length > 0) parts.push('## 代码文件\n' + codeLines.join('\n\n'));

  // repo_documents 摘要
  const docLines: string[] = [];
  for (const d of sources.repoDocs.slice(0, 30)) {
    docLines.push(`### Doc: ${d.relPath} (docId=${d.docId})
title: ${d.title}
excerpt: ${d.excerpt}`);
  }
  if (docLines.length > 0) parts.push('## 文档\n' + docLines.join('\n\n'));

  // commit 历史
  if (sources.recentCommits.length > 0) {
    const commitLines = sources.recentCommits
      .slice(0, 50)
      .map((c) => `- ${c.shortHash} ${c.date} ${c.message} (${c.changedFiles.length} files)`)
      .join('\n');
    parts.push('## 最近 commit\n' + commitLines);
  }

  return parts.join('\n\n').slice(0, maxLen);
}

function buildUserPrompt(mode: CompileMode, repoName: string, sourcesBlock: string): string {
  const slugMap: Record<CompileMode, string> = {
    overview: 'overview',
    modules: 'modules',
    configs: 'configs',
    commits: 'commits',
    all: 'overview',
  };
  const pageTypeMap: Record<CompileMode, ProjectPageType> = {
    overview: 'project_overview',
    modules: 'module_summary',
    configs: 'config_summary',
    commits: 'commit_summary',
    all: 'project_overview',
  };
  const contentTemplates: Record<CompileMode, string> = {
    overview: `## 项目简介\n## 目录结构\n## 主要模块\n## 入口文件\n## 重要配置\n## 已知限制\n## 来源`,
    modules: `## 模块清单\n（每个模块：## {ModuleName} — 路径 / 职责 / 关键文件 / 关键函数 / 依赖）\n## 来源`,
    configs: `## 配置项清单\n（每项：## {MACRO_NAME} — 值 / 位置文件 / 作用 / 影响范围）\n## 来源`,
    commits: `## 最近 30 天提交概览\n## 重要变更\n## 影响范围\n## 时间线\n## 来源`,
    all: `## 项目简介\n## 来源`,
  };

  return `请为项目「${repoName}」编译 ${mode} 模式的 wiki 页。

slug: ${slugMap[mode]}
pageType: ${pageTypeMap[mode]}

## 项目源
${sourcesBlock}

请严格依据上述源生成 JSON。content 必须按以下小节组织（markdown）：
${contentTemplates[mode]}

tags 数组中必须包含 "pageType:${pageTypeMap[mode]}"。`;
}

async function callAI(opts: {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ ok: boolean; text?: string; reason?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const res = await fetch(`${opts.aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.aiModel,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userPrompt },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, reason: `AI API error: ${res.status}` };
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text.trim()) return { ok: false, reason: 'AI 返回为空' };
    return { ok: true, text };
  } catch (err: any) {
    if (err.name === 'AbortError') return { ok: false, reason: 'AI 请求超时（120s）' };
    return { ok: false, reason: `AI 请求失败: ${err.message}` };
  }
}

/**
 * 编译单个项目 wiki 页面。
 *
 * mode='all' 会顺序编译 overview/modules/configs/commits 4 个页面，
 * 单页失败不阻塞其它，返回最后一个成功页（或第一个失败原因）。
 */
export async function compileProjectPage(opts: {
  repoName: string;
  mode: CompileMode;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
}): Promise<CompilePageResult> {
  const { repoName, mode, aiBaseUrl, aiApiKey, aiModel } = opts;

  if (mode === 'all') {
    const allowed = getAllowedModes(repoName);
    const allModes: CompileMode[] = ['overview', 'modules', 'configs', 'commits'];
    const subModes = allModes.filter((m): boolean => allowed.includes(m));
    if (subModes.length === 0) {
      return { ok: false, reason: `no allowed compile modes for this repo (profile restricts to: ${allowed.join(', ')})` };
    }
    let lastOk: CompilePageResult | null = null;
    let firstReason: string | null = null;
    for (const sub of subModes) {
      const r = await compileProjectPage({ ...opts, mode: sub });
      if (r.ok) lastOk = r;
      else if (!firstReason) firstReason = r.reason || 'unknown';
    }
    if (lastOk) return { ...lastOk, mode: 'all' };
    return { ok: false, reason: firstReason || 'all modes failed' };
  }

  const ctx = getProjectContext(repoName);
  if (!ctx) return { ok: false, reason: `repo not found or path invalid: ${repoName}` };

  // Profile mode guard (backstop — route also checks this)
  const allowedModes = getAllowedModes(repoName);
  if (!allowedModes.includes(mode)) {
    return { ok: false, reason: `mode ${mode} is not allowed for this repo (profile restricts to: ${allowedModes.join(', ')})` };
  }

  const spaceId = getOrCreateProjectSpace(repoName, ctx.repoId);

  const slugMap: Record<Exclude<CompileMode, 'all'>, string> = {
    overview: `${repoName}-overview`,
    modules: `${repoName}-modules`,
    configs: `${repoName}-configs`,
    commits: `${repoName}-commit-timeline`,
  };
  const pageTypeMap: Record<Exclude<CompileMode, 'all'>, ProjectPageType> = {
    overview: 'project_overview',
    modules: 'module_summary',
    configs: 'config_summary',
    commits: 'commit_summary',
  };

  const slug = slugMap[mode];
  const pageType = pageTypeMap[mode];

  // 收集源
  const sources = await collectProjectSources(repoName, ctx.repoId);
  const sourceCount =
    sources.codeFiles.length + sources.repoDocs.length + sources.recentCommits.length;

  if (sourceCount === 0) {
    return { ok: false, reason: 'no sources found (consider running scan first)', mode, pageType };
  }

  // 已存在页面：若是同 slug 且 confidence != 'low'，跳过（除非 force，第一版无 force 参数）
  const existing = db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.spaceId, spaceId), eq(wikiPages.slug, slug)))
    .all() as any[];
  if (existing.length > 0 && existing[0].confidence !== 'low') {
    return {
      ok: true,
      alreadyExists: true,
      pageId: existing[0].id,
      confidence: existing[0].confidence,
      mode,
      pageType,
      sourceCount,
    };
  }

  // 调 AI
  const sourcesBlock = buildSourcesBlock(sources);
  const userPrompt = buildUserPrompt(mode, repoName, sourcesBlock);
  const aiRes = await callAI({ aiBaseUrl, aiApiKey, aiModel, systemPrompt: SYSTEM_PROMPT, userPrompt });
  if (!aiRes.ok || !aiRes.text) {
    return { ok: false, reason: aiRes.reason || 'AI failed', mode, pageType, sourceCount };
  }

  const parsed = parseAiJson(aiRes.text);
  const now = new Date().toISOString();

  let title: string;
  let summary: string;
  let content: string;
  let tagsJson: string;
  let sourceRefsJson: string;
  let confidence: string;

  if (parsed) {
    title = String(parsed.title || `${repoName} ${mode}`);
    summary = String(parsed.summary || '');
    content = String(parsed.content || aiRes.text);
    const tags: string[] = Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t)) : [];
    if (!tags.includes(`pageType:${pageType}`)) tags.push(`pageType:${pageType}`);
    tagsJson = JSON.stringify(tags);
    sourceRefsJson = JSON.stringify(
      Array.isArray(parsed.source_refs)
        ? parsed.source_refs.slice(0, 30).map((r: any) => ({
            kind: r.kind || '',
            ref: r.ref || '',
            excerpt: String(r.excerpt || '').slice(0, 300),
          }))
        : []
    );
    confidence = String(parsed.confidence || 'medium');
    if (!['high', 'medium', 'low'].includes(confidence)) confidence = 'medium';
  } else {
    title = `${repoName} ${mode}`;
    summary = '';
    content = aiRes.text;
    tagsJson = JSON.stringify([`pageType:${pageType}`]);
    sourceRefsJson = '[]';
    confidence = 'low';
  }

  // upsert wiki_pages（先删同 space+slug 的旧记录 + 旧 FTS）
  if (existing.length > 0) {
    const oldPageId = existing[0].id;
    try {
      await deleteFtsByDoc('project_wiki', String(oldPageId));
    } catch (err) {
      console.error('[projectBrain] deleteFtsByDoc failed:', err);
    }
    db.delete(wikiPages).where(eq(wikiPages.id, oldPageId)).run();
  }

  const ins = db
    .insert(wikiPages)
    .values({
      spaceId,
      slug,
      title,
      summary,
      content,
      aliasesJson: '[]',
      tagsJson,
      sourceRefsJson,
      confidence,
      createdAt: now,
      updatedAt: now,
    })
    .run() as any;
  const pageId = Number(ins.lastInsertRowid);

  // 写 search_fts（doc_type='project_wiki', doc_id=String(pageId)，不带前缀）
  try {
    await updateFts('project_wiki', String(pageId), title, summary + '\n' + content);
  } catch (err) {
    console.error('[projectBrain] updateFts failed:', err);
  }

  console.log(
    `[projectBrain] compiled ${repoName}/${mode}: confidence=${confidence}, sources=${sourceCount}, pageId=${pageId}`
  );
  return { ok: true, pageId, mode, pageType, confidence, sourceCount };
}

// ─── 状态查询 ────────────────────────────────────────────────────────────────

export interface ProjectBrainStatus {
  repoId: number;
  repoName: string;
  profile: string;
  codeFileCount: number;
  symbolCount: number;
  lastScanAt: string | null;
  wikiPages: { id: number; slug: string; title: string; pageType: string; confidence: string; updatedAt: string }[];
}

export function getProjectBrainStatus(repoName: string): ProjectBrainStatus | null {
  const ctx = getProjectContext(repoName);
  if (!ctx) return null;

  // docs profile has no code files or symbols
  const profile = getRepoProfile(repoName);
  if (profile === 'docs') {
    return {
      repoId: ctx.repoId,
      repoName,
      profile: 'docs',
      codeFileCount: 0,
      symbolCount: 0,
      lastScanAt: null,
      wikiPages: [],
    };
  }

  const fileRows = db
    .select({ id: projectCodeFiles.id, indexedAt: projectCodeFiles.indexedAt })
    .from(projectCodeFiles)
    .where(eq(projectCodeFiles.repoId, ctx.repoId))
    .all() as any[];
  const codeFileCount = fileRows.length;
  let lastScanAt: string | null = null;
  for (const f of fileRows) {
    if (f.indexedAt && (!lastScanAt || f.indexedAt > lastScanAt)) lastScanAt = f.indexedAt;
  }

  const symCount = (db
    .select({ id: projectSymbols.id })
    .from(projectSymbols)
    .where(eq(projectSymbols.repoId, ctx.repoId))
    .all() as any[]).length;
  let spaceId: number | null = null;
  try {
    const space = db
      .select()
      .from(wikiSpaces)
      .where(and(eq(wikiSpaces.sourceType, 'project'), eq(wikiSpaces.sourceId, ctx.repoId)))
      .all() as any[];
    if (space.length > 0) spaceId = space[0].id;
  } catch {}

  let wikiPagesList: ProjectBrainStatus['wikiPages'] = [];
  if (spaceId) {
    const rows = db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.spaceId, spaceId))
      .all() as any[];
    wikiPagesList = rows.map((p: any) => {
      let pt = 'concept';
      try {
        const tags: string[] = JSON.parse(p.tagsJson || '[]');
        const t = tags.find((x) => x.startsWith('pageType:'));
        if (t) pt = t.split(':')[1];
      } catch {}
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        pageType: pt,
        confidence: p.confidence,
        updatedAt: p.updatedAt,
      };
    });
  }

  return {
    repoId: ctx.repoId,
    repoName: ctx.repoName,
    profile: getRepoProfile(repoName),
    codeFileCount,
    symbolCount: symCount,
    lastScanAt,
    wikiPages: wikiPagesList,
  };
}

// ─── 项目关键词检测（供 /ask 调用） ──────────────────────────────────────────

export interface ProjectContextDetection {
  detected: boolean;
  repoName: string | null;
  repoId: number | null;
  terms: string[];
}

/**
 * 检测问题是否包含项目关键词，并匹配到 repo_sources 中的某个 repo。
 * 不硬编码 repoName：先匹配关键词，再用 repo_sources 表中的实际 repo 校验。
 */
export function detectProjectContext(question: string): ProjectContextDetection {
  const q = question.toLowerCase();
  // 必须含疑问词，否则不算项目问答
  if (!/[?？]|是什么|怎么|为什么|哪里|哪些|哪个|如何|why|how|where|which|区别|对应/.test(question)) {
    return { detected: false, repoName: null, repoId: null, terms: [] };
  }

  const PROJECT_KEYWORDS = [
    'robin', 'selfie', 'tx', 'rx', 'efuse', 'fpga', 'rom', 'flash',
    'ble', 'hid', 'low power', 'low-power', 'sleep', 'boost', 'tc1225',
    'tc_ble_lite_sdk', 'tc_ble', 'telink', '软开机', '低功耗', '软关机',
    '编译选项', '构建脚本', 'boot', 'vendor', 'bluelight',
  ];

  const matchedKeywords: string[] = [];
  for (const kw of PROJECT_KEYWORDS) {
    if (q.includes(kw)) matchedKeywords.push(kw);
  }
  if (matchedKeywords.length === 0) {
    return { detected: false, repoName: null, repoId: null, terms: [] };
  }

  // 在 repo_sources 表中查找匹配的 repo
  const allRepos = db.select().from(repoSources).all() as any[];
  let bestRepo: any | null = null;
  let bestScore = 0;

  for (const repo of allRepos) {
    const nameLower = String(repo.name || '').toLowerCase();
    let score = 0;
    // repo name 本身就是关键词匹配
    for (const kw of matchedKeywords) {
      if (nameLower.includes(kw)) score += 10;
    }
    // 检查 repo.localPath 是否含关键词
    const pathLower = String(repo.localPath || '').toLowerCase();
    for (const kw of matchedKeywords) {
      if (pathLower.includes(kw)) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRepo = repo;
    }
  }

  // 即使没匹配到具体 repo，也尝试用最近活跃 repo 兜底
  // （按 last_sync_at desc）
  if (!bestRepo && allRepos.length > 0) {
    const sorted = [...allRepos].sort((a, b) => {
      const ta = a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : 0;
      const tb = b.lastSyncAt ? new Date(b.lastSyncAt).getTime() : 0;
      return tb - ta;
    });
    // 只在关键词强相关时兜底（selfie/tx/rx/efuse/fpga 等）
    const STRONG_KW = ['selfie', 'tx', 'rx', 'efuse', 'fpga', 'robin', 'tc1225', 'tc_ble'];
    if (matchedKeywords.some((k) => STRONG_KW.includes(k))) {
      bestRepo = sorted[0];
    }
  }

  if (!bestRepo) {
    return {
      detected: true,
      repoName: null,
      repoId: null,
      terms: matchedKeywords,
    };
  }

  return {
    detected: true,
    repoName: bestRepo.name,
    repoId: bestRepo.id,
    terms: matchedKeywords,
  };
}

/**
 * 取代码文件的完整内容（按 fileId）。/api/code-files / /code 用。
 * 不缓存，每次直接读盘。
 */
export function getCodeFileContent(fileId: number): {
  relPath: string;
  language: string;
  content: string;
  symbols: any[];
} | null {
  const row = db
    .select()
    .from(projectCodeFiles)
    .where(eq(projectCodeFiles.id, fileId))
    .get() as any;
  if (!row) return null;

  // 从 repo_sources.localPath 拼出绝对路径
  const repoRow = db
    .select()
    .from(repoSources)
    .where(eq(repoSources.id, row.repoId))
    .get() as any;
  if (!repoRow || !repoRow.localPath) return null;

  const abs = path.join(repoRow.localPath, row.relPath);
  if (!isPathUnderReposBase(abs)) return null;
  let realPath: string;
  try {
    realPath = fs.realpathSync(abs);
  } catch {
    return null;
  }
  let content = '';
  try {
    content = fs.readFileSync(realPath, 'utf8');
  } catch {
    return null;
  }

  let symbols: any[] = [];
  try {
    symbols = JSON.parse(row.symbolsJson || '[]');
  } catch {}

  return {
    relPath: row.relPath,
    language: row.language,
    content,
    symbols,
  };
}

// 避免 sqlite 在 isPathUnderReposBase 之外被误用告警
void sqlite;
