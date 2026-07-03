// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { wikiSpaces, wikiPages } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const spaces = db.select().from(wikiSpaces).all() as any[];
    const result = spaces.map((s) => {
      const countRow = db
        .select({ cnt: sql<number>`count(*)` })
        .from(wikiPages)
        .where(eq(wikiPages.spaceId, s.id))
        .get() as any;
      return {
        id: s.id,
        name: s.name,
        description: s.description || '',
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        pageCount: countRow?.cnt || 0,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });
    return NextResponse.json({ spaces: result });
  } catch (err: any) {
    return NextResponse.json({ error: `获取 wiki_spaces 失败: ${err.message}` }, { status: 500 });
  }
}
