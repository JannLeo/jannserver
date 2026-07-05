import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const dbPath = path.join(process.cwd(), 'data', 'app.db');

// Get repo local path from repoSources
function getRepoPath(repoContext: string): string | null {
  if (!repoContext) return null;
  try {
    const db = new Database(dbPath, { readonly: true });
    const repo = db.prepare('SELECT local_path FROM repo_sources WHERE name = ?').get(repoContext) as any;
    db.close();
    if (repo?.local_path && fs.existsSync(repo.local_path)) {
      return repo.local_path;
    }
  } catch (_e) {}
  // Fallback: treat repoContext as an absolute path
  if (fs.existsSync(repoContext)) return repoContext;
  return null;
}

// Get file tree using git ls-tree or tree command
function getFileTree(repoPath: string, subPath: string, depth: number = 3): string {
  const target = path.join(repoPath, subPath);
  if (!fs.existsSync(target)) return '';

  const maxFiles = 80;
  const files: string[] = [];

  function walk(dir: string, currentDepth: number) {
    if (currentDepth > depth) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles) return;
        const relative = path.relative(repoPath, path.join(dir, entry.name));
        const prefix = currentDepth === 0 ? '' : '  '.repeat(currentDepth);
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', '__pycache__', 'build', 'dist', '.next', '.cache', 'vendor'].includes(entry.name)) {
            files.push(`${prefix}📁 ${relative}/`);
            walk(path.join(dir, entry.name), currentDepth + 1);
          }
        } else {
          const ext = path.extname(entry.name);
          if (['', '.c', '.h', '.cpp', '.py', '.ts', '.tsx', '.js', '.jsx', '.rs', '.go', '.java', '.md', '.txt', '.json', '.yaml', '.toml'].includes(ext) || entry.name.startsWith('Makefile') || entry.name.startsWith('CMake')) {
            files.push(`${prefix}  📄 ${relative}`);
          }
        }
      }
    } catch (_e) {}
  }

  walk(target, 0);
  return files.slice(0, maxFiles).join('\n');
}

// Get key source files for overview
function getKeyFiles(repoPath: string, subPath: string, count: number = 5): Array<{ relPath: string; content: string }> {
  const target = path.join(repoPath, subPath);
  if (!fs.existsSync(target)) return [];

  const files: Array<{ relPath: string; size: number; path: string }> = [];

  function walk(dir: string, depth: number) {
    if (depth > 4 || files.length >= count * 3) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= count * 3) return;
        const full = path.join(dir, entry.name);
        const rel = path.relative(repoPath, full);
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', '__pycache__', 'build', 'dist', '.next', '.cache', 'vendor'].includes(entry.name)) {
            walk(full, depth + 1);
          }
        } else {
          const ext = path.extname(entry.name);
          const codeExts = ['.c', '.h', '.cpp', '.py', '.ts', '.tsx', '.js', '.rs', '.go', '.java'];
          if (codeExts.includes(ext) || entry.name === 'Makefile' || entry.name === 'CMakeLists.txt' || entry.name === 'README.md') {
            try {
              const stat = fs.statSync(full);
              if (stat.size < 100 * 1024) { // < 100KB
                files.push({ relPath: rel, size: stat.size, path: full });
              }
            } catch (_e) {}
          }
        }
      }
    } catch (_e) {}
  }

  walk(target, 0);

  // Sort by size desc, take top N
  files.sort((a, b) => b.size - a.size);
  return files.slice(0, count).map(f => ({
    relPath: f.relPath,
    content: fs.readFileSync(f.path, 'utf-8').slice(0, 4000),
  }));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const courseId = params.id;

    // Get course
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      db.close();
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // Get all modules for this course that have repo_context
    const modules = db.prepare(`
      SELECT id, title, description, repo_context, repo_path
      FROM course_modules
      WHERE course_id = ?
      ORDER BY "order" ASC
    `).all(courseId) as any[];

    db.close();

    const result: any = {
      course,
      modules: modules.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        hasRepo: !!(m.repo_context && m.repo_path),
        repoContext: m.repo_context,
        repoPath: m.repo_path,
      })),
    };

    // Generate overview for modules with repo_context
    for (const mod of result.modules) {
      if (!mod.hasRepo) continue;

      const repoPath = getRepoPath(mod.repoContext);
      if (!repoPath) {
        mod.overview = { error: `仓库路径未找到: ${mod.repoContext}` };
        continue;
      }

      const targetPath = path.join(repoPath, mod.repoPath);
      if (!fs.existsSync(targetPath)) {
        mod.overview = { error: `路径不存在: ${mod.repoContext}/${mod.repoPath}` };
        continue;
      }

      try {
        mod.fileTree = getFileTree(repoPath, mod.repoPath, 3);
        mod.keyFiles = getKeyFiles(repoPath, mod.repoPath, 5);
      } catch (err: any) {
        mod.overview = { error: err.message };
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}