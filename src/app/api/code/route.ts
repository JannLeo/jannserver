import { NextRequest, NextResponse } from 'next/server';
import { sqlite } from '@/lib/db/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function boundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const limit = boundedInt(url.searchParams.get('limit'), 20, 1, 50);
  const offset = boundedInt(url.searchParams.get('offset'), 0, 0, 100_000);

  if (q.length < 2 || q.length > 256) {
    return NextResponse.json(
      { error: 'Query must be between 2 and 256 characters' },
      { status: 400 },
    );
  }

  const rawSqlite: any = sqlite;

  // Search literal text in rel_path and summary. Escape LIKE metacharacters so a
  // query such as "%%" cannot silently become an unbounded wildcard search.
  const likePattern = `%${escapeLike(q)}%`;

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
      AND (f.rel_path LIKE ? ESCAPE '\\' OR f.summary LIKE ? ESCAPE '\\')
    ORDER BY f.indexed_at DESC
    LIMIT ? OFFSET ?
  `).all(likePattern, likePattern, limit, offset) as any[];

  const countRow = rawSqlite.prepare(`
    SELECT COUNT(*) as total
    FROM project_code_files f
    JOIN repo_sources r ON r.id = f.repo_id
    WHERE r.enabled = 1
      AND (f.rel_path LIKE ? ESCAPE '\\' OR f.summary LIKE ? ESCAPE '\\')
  `).get(likePattern, likePattern) as any;

  const results = rows.map((row: any) => ({
    id: row.id,
    repoId: row.repo_id,
    repoName: row.repo_name,
    repoUrl: row.repo_url,
    filename: row.rel_path.split('/').pop(),
    relPath: row.rel_path,
    language: row.language,
    sizeBytes: row.size_bytes,
    summary: row.summary || '',
    indexedAt: row.indexed_at,
    matchSnippet: row.summary ? row.summary.substring(0, 200) : row.rel_path,
  }));

  return NextResponse.json({
    query: q,
    total: countRow?.total ?? 0,
    limit,
    offset,
    results,
  });
}
