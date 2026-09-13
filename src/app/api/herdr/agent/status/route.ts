/**
 * GET /api/herdr/agent/status — 查询所有 agent 状态
 */
import { NextResponse } from 'next/server';
import { herdrAgentList, HerdrRpcError } from '@/lib/herdr-socket';

export async function GET() {
  try {
    const result = await herdrAgentList();
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof HerdrRpcError ? e.message : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}