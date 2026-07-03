// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { wikiPages } from '@/lib/db/schema';
import { eq, or, like, and, desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const spaceIdStr = req.nextUrl.searchParams.get('spaceId');
    const q = (req.nextUrl.searchParams.get('q') || '').trim();

    if (!spaceIdStr) return NextResponse.json({ error: 'spaceId 是必填项' }, { status: 400 });
    const spaceId = Number(spaceIdStr);
    if (!spaceId) return NextResponse.json({ error: 'spaceId 无效' }, { status: 400 });

    let rows: any[];
    if (q) {
      const pattern = `%${q}%`;
      rows = db
        .select({
          id: wikiPages.id,
          spaceId: wikiPages.spaceId,
          slug: wikiPages.slug,
          title: wikiPages.title,
          summary: wikiPages.summary,
          tagsJson: wikiPages.tagsJson,
          confidence: wikiPages.confidence,
          updatedAt: wikiPages.updatedAt,
        })
        .from(wikiPages)
        .where(
          and(
            eq(wikiPages.spaceId, spaceId),
            or(like(wikiPages.title, pattern), like(wikiPages.summary, pattern))
          )
        )
        .orderBy(desc(wikiPages.updatedAt))
        .limit(100)
        .all() as any[];
    } else {
      rows = db
        .select({
          id: wikiPages.id,
          spaceId: wikiPages.spaceId,
          slug: wikiPages.slug,
          title: wikiPages.title,
          summary: wikiPages.summary,
          tagsJson: wikiPages.tagsJson,
          confidence: wikiPages.confidence,
          updatedAt: wikiPages.updatedAt,
        })
        .from(wikiPages)
        .where(eq(wikiPages.spaceId, spaceId))
        .orderBy(desc(wikiPages.updatedAt))
        .limit(100)
        .all() as any[];
    }

    return NextResponse.json({ items: rows, total: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: `获取 wiki_pages 失败: ${err.message}` }, { status: 500 });
  }
}
