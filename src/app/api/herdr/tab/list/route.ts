/**
 * GET /api/herdr/tab/list
 * List all tabs, optionally filtered by workspace.
 * Query: ?workspace_id=xxx
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrTabList, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const workspaceId = req.nextUrl.searchParams.get('workspace_id');
    const result = await herdrTabList({ workspace_id: workspaceId ?? null });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof HerdrRpcError
      ? error.message
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
