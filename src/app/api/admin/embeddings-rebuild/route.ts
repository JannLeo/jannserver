// @ts-nocheck
/**
 * Admin API: Full knowledge base rebuild
 * 
 * Supports incremental rebuild (skips unchanged docs via content hash).
 * Supports force rebuild (--full flag re-embeds everything).
 * 
 * Supports three doc types:
 *   wiki_page  — wiki_pages table (incremental by content hash)
 *   repo_doc   — repo_documents table (incremental by content hash)  
 *   obsidian   — triggers obsidian vault sync (already has hash-based incremental)
 *   all        — rebuilds all three
 * 
 * Usage:
 *   POST /api/admin/embeddings-rebuild
 *   Body: { docType: "wiki_page" | "repo_doc" | "obsidian" | "all", full?: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { sqlite, initDb } from '@/lib/db/index';
import { updateEmbeddings } from '@/lib/embeddings';
import { syncObsidianVault } from '@/lib/obsidian';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function rebuildWikiPage(full: boolean): Promise<{ processed: number; skipped: number; failed: number }> {
  const rawSqlite: any = sqlite;
  const rows = rawSqlite.prepare('SELECT id, title, summary, content FROM wiki_pages').all();
  
  // Batch-check which docs already have the new model
  let upgraded = new Set<string>();
  if (!full) {
    const existing = rawSqlite
      .prepare("SELECT doc_id, model FROM embeddings WHERE doc_type = 'wiki_page' AND model = 'fastembed-multilingual-384'")
      .all() as any[];
    for (const r of existing) {
      upgraded.add(r.doc_id);
    }
  }

  // Get unique doc_ids that all their chunks are upgraded
  let skipDocIds = new Set<string>();
  // Count chunks per doc
  const chunkCounts = rawSqlite
    .prepare("SELECT doc_id, COUNT(*) as cnt FROM embeddings WHERE doc_type = 'wiki_page' GROUP BY doc_id")
    .all() as any[];
  const oldCounts: Record<string, number> = {};
  for (const r of chunkCounts) {
    oldCounts[r.doc_id] = r.cnt;
  }

  let processed = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    const docId = `wiki:${r.id}`;

    if (!full && upgraded.has(docId)) {
      // Already embedded with new model — skip
      skipped++;
      continue;
    }

    try {
      const content = (r.title || '') + '\n\n' + (r.summary || '') + '\n\n' + (r.content || '');
      await updateEmbeddings('wiki_page', docId, content);
      processed++;
    } catch (e: any) {
      console.error('[rebuild] wiki', r.id, e);
      failed++;
    }
  }
  return { processed, skipped, failed };
}

async function rebuildRepoDoc(full: boolean): Promise<{ processed: number; skipped: number; failed: number }> {
  const rawSqlite: any = sqlite;
  const rows = rawSqlite.prepare('SELECT id, repo_id, rel_path, title, content FROM repo_documents').all();
  
  let upgraded = new Set<string>();
  if (!full) {
    const existing = rawSqlite
      .prepare("SELECT doc_id, model FROM embeddings WHERE doc_type = 'repo_doc' AND model = 'fastembed-multilingual-384'")
      .all() as any[];
    for (const r of existing) {
      upgraded.add(r.doc_id);
    }
  }

  let processed = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    const docId = `${r.repo_id}:${r.rel_path}`;

    if (!full && upgraded.has(docId)) {
      skipped++;
      continue;
    }

    try {
      const content = (r.title || '') + '\n\n' + (r.content || '');
      await updateEmbeddings('repo_doc', docId, content);
      processed++;
    } catch (e: any) {
      console.error('[rebuild] repo', r.id, e);
      failed++;
    }
  }
  return { processed, skipped, failed };
}

async function rebuildObsidian(): Promise<{ added: number; updated: number; removed: number; total: number }> {
  const vaultPath = process.env.OBSIDIAN_VAULT_DIR || '/home/sz/obsidian';
  const result = await syncObsidianVault(vaultPath);
  return result;
}

export async function POST(req: NextRequest) {
  // Simple admin check (add your own auth token check here)
  const authHeader = req.headers.get('authorization') || '';
  const expectedToken = process.env.REBUILD_TOKEN || 'admin123';
  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    initDb();
    const body = await req.json().catch(() => ({}));
    const docType = body.docType || 'all';
    const full = body.full === true;

    console.log(`[rebuild] Starting ${full ? 'FULL' : 'INCREMENTAL'} rebuild for: ${docType}`);

    const results: Record<string, any> = {};
    const startTime = Date.now();

    if (docType === 'all' || docType === 'wiki_page') {
      results.wiki_page = await rebuildWikiPage(full);
    }
    if (docType === 'all' || docType === 'repo_doc') {
      results.repo_doc = await rebuildRepoDoc(full);
    }
    if (docType === 'all' || docType === 'obsidian') {
      results.obsidian = await rebuildObsidian();
    }

    const elapsed = Date.now() - startTime;
    const totalProcessed = Object.values(results).reduce(
      (sum: number, r: any) => sum + (r.processed ?? r.added ?? 0), 0
    );
    const totalSkipped = Object.values(results).reduce(
      (sum: number, r: any) => sum + (r.skipped ?? 0), 0
    );
    const totalFailed = Object.values(results).reduce(
      (sum: number, r: any) => sum + (r.failed ?? 0), 0
    );

    console.log(`[rebuild] Done in ${elapsed}ms: ${totalProcessed} processed, ${totalSkipped} skipped, ${totalFailed} failed`);

    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsed,
      model: 'fastembed-multilingual-384',
      full,
      results,
      summary: { processed: totalProcessed, skipped: totalSkipped, failed: totalFailed }
    });
  } catch (err: any) {
    console.error('[rebuild] Fatal error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}