/**
 * POST /api/herdr/agent/send — 向 agent 发送输入
 * Body: { target, text }
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrAgentSend, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

const MAX_AGENT_INPUT_BYTES = 256 * 1024;

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const body = await req.json();
    const target = typeof body?.target === 'string' ? body.target.trim() : '';
    const text = typeof body?.text === 'string' ? body.text : '';

    if (!target || target.length > 200) {
      return NextResponse.json({ error: '无效的 target' }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: '缺少 text' }, { status: 400 });
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_AGENT_INPUT_BYTES) {
      return NextResponse.json({ error: 'text 过大' }, { status: 413 });
    }

    const result = await herdrAgentSend({ target, text });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof HerdrRpcError
      ? error.message
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
