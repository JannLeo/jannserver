// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { sqlite, initDb } from '@/lib/db/index';
import { updateEmbeddings } from '@/lib/embeddings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { docType } = await req.json();
    if (!['wiki_page', 'repo_doc', 'obsidian_note'].includes(docType)) {
      return NextResponse.json({ ok: false, error: 'invalid docType' }, { status: 400 });
    }

    if (docType === 'obsidian_note') {
      return NextResponse.json(
        { ok: false, error: 'use /api/obsidian/sync for obsidian_note' },
        { status: 400 }
      );
    }

    initDb();
    const rawSqlite: any = sqlite;
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    if (docType === 'wiki_page') {
      const rows = rawSqlite.prepare('SELECT id, title, summary, content FROM wiki_pages').all();
      for (const r of rows) {
        try {
          const content = (r.title || '') + '\n\n' + (r.summary || '') + '\n\n' + (r.content || '');
          await updateEmbeddings('wiki_page', `wiki:${r.id}`, content);
          processed++;
        } catch (e: any) {
          console.error('[rebuild] wiki', r.id, e);
          failed++;
          if (errors.length < 10) errors.push(`wiki:${r.id} - ${e.message}`);
        }
      }
    } else if (docType === 'repo_doc') {
      const rows = rawSqlite
        .prepare('SELECT id, repo_id, rel_path, title, content FROM repo_documents')
        .all();
      for (const r of rows) {
        try {
          const content = (r.title || '') + '\n\n' + (r.content || '');
          await updateEmbeddings('repo_doc', `${r.repo_id}:${r.rel_path}`, content);
          processed++;
        } catch (e: any) {
          console.error('[rebuild] repo', r.id, e);
          failed++;
          if (errors.length < 10) errors.push(`repo_doc:${r.repo_id}:${r.rel_path} - ${e.message}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      docType,
      processed,
      failed,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
