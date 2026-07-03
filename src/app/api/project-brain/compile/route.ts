import { NextRequest, NextResponse } from 'next/server';
import { compileProjectPage, type CompileMode } from '@/lib/projectBrain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_MODES: CompileMode[] = ['overview', 'modules', 'configs', 'commits', 'all'];

export async function POST(req: NextRequest) {
  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  const aiApiKey = (process.env.AI_API_KEY || '').trim();
  const aiModel = (process.env.AI_MODEL || '').trim();

  if (!aiBaseUrl || !aiApiKey || !aiModel) {
    return NextResponse.json({ configured: false, error: 'AI 未配置' });
  }

  let body: { repoName?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 });
  }

  const repoName = typeof body.repoName === 'string' ? body.repoName.trim() : '';
  const modeRaw = typeof body.mode === 'string' ? (body.mode.trim() as CompileMode) : 'overview';

  if (!repoName) return NextResponse.json({ error: 'repoName 是必填项' }, { status: 400 });
  if (!VALID_MODES.includes(modeRaw)) {
    return NextResponse.json(
      { error: `mode 必须是: ${VALID_MODES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const result = await compileProjectPage({
      repoName,
      mode: modeRaw,
      aiBaseUrl,
      aiApiKey,
      aiModel,
    });
    return NextResponse.json({ configured: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { configured: true, ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
