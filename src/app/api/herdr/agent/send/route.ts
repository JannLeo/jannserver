/**
 * POST /api/herdr/agent/send — 向 agent 发送输入
 * Body: { target, text }
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrAgentSend, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;
  try {
    const body = await req.json();
    if (!body.target) return NextResponse.json({ error: '缺少 target' }, { status: 400 });
    if (!body.text) return NextResponse.json({ error: '缺少 text' }, { status: 400 });
    const result = await herdrAgentSend({ target: body.target, text: body.text });
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof HerdrRpcError ? e.message : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
