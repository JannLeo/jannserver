// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { wikiPages, wikiLinks } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pageId = Number(params.id);
    if (!pageId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const page = db.select().from(wikiPages).where(eq(wikiPages.id, pageId)).get() as any;
    if (!page) return NextResponse.json({ error: 'Wiki page not found' }, { status: 404 });

    // 解析 JSON 字段
    let aliases: any[] = [];
    let tags: any[] = [];
    let sourceRefs: any[] = [];
    try { aliases = JSON.parse(page.aliasesJson || '[]'); } catch {}
    try { tags = JSON.parse(page.tagsJson || '[]'); } catch {}
    try { sourceRefs = JSON.parse(page.sourceRefsJson || '[]'); } catch {}

    // 查 backlinks（其他 page 指向当前 page）
    const backlinks = db
      .select({
        id: wikiLinks.id,
        fromPageId: wikiLinks.fromPageId,
        linkText: wikiLinks.linkText,
        relationType: wikiLinks.relationType,
      })
      .from(wikiLinks)
      .where(and(eq(wikiLinks.toPageId, pageId), eq(wikiLinks.spaceId, page.spaceId)))
      .all() as any[];

    // 查 outgoing links（当前 page 指向其他 page）
    const outgoing = db
      .select({
        id: wikiLinks.id,
        toPageId: wikiLinks.toPageId,
        linkText: wikiLinks.linkText,
        relationType: wikiLinks.relationType,
      })
      .from(wikiLinks)
      .where(and(eq(wikiLinks.fromPageId, pageId), eq(wikiLinks.spaceId, page.spaceId)))
      .all() as any[];

    // 补充 backlinks/outgoing 的 title
    const enrichLinks = (links: any[], isOutgoing: boolean) => {
      return links.map((l) => {
        const targetId = isOutgoing ? l.toPageId : l.fromPageId;
        let title = '';
        if (targetId) {
          const target = db.select({ title: wikiPages.title, slug: wikiPages.slug }).from(wikiPages).where(eq(wikiPages.id, targetId)).get() as any;
          title = target?.title || '';
        }
        return { ...l, title, unresolved: !targetId };
      });
    };

    return NextResponse.json({
      id: page.id,
      spaceId: page.spaceId,
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      content: page.content,
      aliases,
      tags,
      sourceRefs,
      confidence: page.confidence,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      backlinks: enrichLinks(backlinks, false),
      outgoingLinks: enrichLinks(outgoing, true),
    });
  } catch (err: any) {
    return NextResponse.json({ error: `获取 wiki_page 失败: ${err.message}` }, { status: 500 });
  }
}
