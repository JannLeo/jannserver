import { NextRequest, NextResponse } from 'next/server';
import { searchAll } from '@/lib/search';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const type = searchParams.get('type') as 'note' | 'memo' | 'daily' | undefined;
  if (!q) return NextResponse.json([]);

  const results = await searchAll(q, type);
  return NextResponse.json(results);
}