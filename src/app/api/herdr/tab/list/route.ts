/**
 * GET /api/herdr/tab/list
 * List all tabs, optionally filtered by workspace.
 *
 * Query: ?workspace_id=xxx
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrTabList, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export async function GET(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const workspace_id = req.nextUrl.searchParams.get('workspace_id');
    const result = await herdrTabList({ workspace_id: workspace_id ?? null });
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof HerdrRpcError ? e.message : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
