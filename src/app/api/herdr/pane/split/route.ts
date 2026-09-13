/**
 * POST /api/herdr/pane/split
 * Split a pane horizontally or vertically.
 *
 * Body: {
 *   direction: "right" | "down",
 *   cwd?: string,
 *   env?: Record<string,string>,
 *   focus?: boolean,          // default true
 *   ratio?: number,           // 0.0–1.0
 *   target_pane_id?: string,  // pane to split (default: current)
 *   workspace_id?: string,
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrPaneSplit, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const body = await req.json();
    const { direction } = body;

    if (!direction || !['right', 'down'].includes(direction)) {
      return NextResponse.json(
        { error: 'direction 必填，值为 "right" 或 "down"' },
        { status: 400 }
      );
    }

    const result = await herdrPaneSplit({
      direction,
      cwd: body.cwd ?? null,
      env: body.env ?? {},
      focus: body.focus ?? true,
      ratio: body.ratio ?? null,
      target_pane_id: body.target_pane_id ?? null,
      workspace_id: body.workspace_id ?? null,
    });

    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof HerdrRpcError ? e.message : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
