import { NextRequest, NextResponse } from 'next/server';
import { documents } from '@/lib/system-prompts';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slugParts = params.slug || [];
  const filename = slugParts[slugParts.length - 1] || '';
  const docSlug = filename.replace(/\.md$/, '').replace(/-/g, '_');

  const doc = documents.find(d => d.slug === docSlug);
  if (!doc) {
    return new NextResponse(`# 404 Not Found\n\n没有找到: ${filename}`, {
      status: 404,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  return new NextResponse(doc.content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}