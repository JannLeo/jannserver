import { NextRequest, NextResponse } from 'next/server';
import { sqlite } from '@/lib/db/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50);
  const offset = Number(url.searchParams.get('offset') || '0');

  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const rawSqlite: any = sqlite;

  // Search in rel_path and summary fields across all repos
  const likePattern = `%${q}%`;

  const rows = rawSqlite.prepare(`
    SELECT
      f.id,
      f.repo_id,
      f.rel_path,
      f.language,
      f.size_bytes,
      f.summary,
      f.indexed_at,
      r.name as repo_name,
      r.url as repo_url
    FROM project_code_files f
    JOIN repo_sources r ON r.id = f.repo_id
    WHERE r.enabled = 1
      AND (f.rel_path LIKE ? OR f.summary LIKE ?)
    ORDER BY f.indexed_at DESC
    LIMIT ? OFFSET ?
  `).all(likePattern, likePattern, limit, offset) as any[];

  // Get total count
  const countRow = rawSqlite.prepare(`
    SELECT COUNT(*) as total
    FROM project_code_files f
    JOIN repo_sources r ON r.id = f.repo_id
    WHERE r.enabled = 1
      AND (f.rel_path LIKE ? OR f.summary LIKE ?)
  `).get(likePattern, likePattern) as any;

  const results = rows.map((r: any) => ({
    id: r.id,
    repoId: r.repo_id,
    repoName: r.repo_name,
    repoUrl: r.repo_url,
    filename: r.rel_path.split('/').pop(),
    relPath: r.rel_path,
    language: r.language,
    sizeBytes: r.size_bytes,
    summary: r.summary || '',
    indexedAt: r.indexed_at,
    // Highlight matching snippet
    matchSnippet: r.summary
      ? r.summary.substring(0, 200)
      : r.rel_path,
  }));

  return NextResponse.json({
    query: q,
    total: countRow?.total ?? 0,
    limit,
    offset,
    results,
  });
}