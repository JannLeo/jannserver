// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { compileConcept } from '@/lib/wiki';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  const aiApiKey = (process.env.AI_API_KEY || '').trim();
  const aiModel = (process.env.AI_MODEL || '').trim();

  if (!aiBaseUrl || !aiApiKey || !aiModel) {
    return NextResponse.json({ configured: false, error: 'AI 未配置' });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 });
  }

  const repoName = typeof body.repoName === 'string' ? body.repoName.trim() : '';
  const mode = typeof body.mode === 'string' ? body.mode.trim() : 'glossary';
  const concept = typeof body.concept === 'string' ? body.concept.trim() : '';

  if (!repoName) return NextResponse.json({ error: 'repoName 是必填项' }, { status: 400 });
  if (!concept) return NextResponse.json({ error: 'concept 是必填项' }, { status: 400 });

  const result = await compileConcept({ repoName, slug: concept, aiBaseUrl, aiApiKey, aiModel });

  return NextResponse.json({
    configured: true,
    repoName,
    mode,
    concept,
    ...result,
  });
}
