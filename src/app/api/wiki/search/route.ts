// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { wikiPages } from '@/lib/db/schema';
import { or, like, desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim();

    if (!q) {
      return NextResponse.json([]);
    }

    const pattern = `%${q}%`;

    // 跨所有 space 搜索 title 和 summary，限制最多 50 条
    const rows = db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        summary: wikiPages.summary,
        content: wikiPages.content,
      })
      .from(wikiPages)
      .where(
        or(like(wikiPages.title, pattern), like(wikiPages.summary, pattern))
      )
      .orderBy(desc(wikiPages.updatedAt))
      .limit(50)
      .all() as any[];

    // 映射为 WikiEntry 格式：取前 200 字符作为 content 摘要
    const entries = rows.map((row) => {
      const raw = row.content || row.summary || '';
      // 取前 200 字符
      const content = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
      return {
        id: row.id,
        title: row.title,
        content,
      };
    });

    return NextResponse.json(entries);
  } catch (err: any) {
    return NextResponse.json({ error: `wiki 搜索失败: ${err.message}` }, { status: 500 });
  }
}