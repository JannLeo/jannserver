/**
 * POST /api/herdr/agent/stop — 停止 agent（关闭其关联 pane）
 * Body: { agentId: string, paneId?: string } — paneId optional override
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrAgentGet, herdrPaneClose, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;
  try {
    const body = await req.json();
    if (!body.agentId) return NextResponse.json({ error: '缺少 agentId' }, { status: 400 });

    // If caller knows paneId, use it directly (avoids extra socket call)
    if (body.paneId) {
      await herdrPaneClose({ pane_id: body.paneId });
      return NextResponse.json({ result: 'agent stopped', paneId: body.paneId });
    }

    // Otherwise look it up — uses one socket call; caller should prefer passing paneId
    const agent: any = await herdrAgentGet({ target: body.agentId });
    const paneId = agent?.pane_id || agent?.paneId;
    if (paneId) {
      await herdrPaneClose({ pane_id: paneId });
      return NextResponse.json({ result: 'agent stopped', paneId });
    }

    return NextResponse.json({ error: 'pane_id not found in agent' }, { status: 404 });
  } catch (e) {
    const msg = e instanceof HerdrRpcError ? e.message : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
