/**
 * GET /api/herdr/agent/status — 查询所有 agent 状态
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrAgentList, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const result = await herdrAgentList();
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof HerdrRpcError
      ? error.message
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
