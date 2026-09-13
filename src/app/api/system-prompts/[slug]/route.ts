import { NextRequest, NextResponse } from 'next/server';
import { documents } from '@/lib/system-prompts';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const doc = documents.find(d => d.slug === params.slug);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  return NextResponse.json(doc);
}