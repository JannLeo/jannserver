/**
 * GET /api/herdr/agent/status — 查询所有 agent 状态
 */
import { NextResponse } from 'next/server';
import { herdrAgentList, HerdrRpcError } from '@/lib/herdr-socket';

export const dynamic = 'force-dynamic';

export async function GET() {
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
