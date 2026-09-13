/**
 * POST /api/herdr/tab/create
 * Create a new tab.
 *
 * Body: {
 *   label?: string,
 *   cwd?: string,
 *   env?: Record<string,string>,
 *   focus?: boolean,         // default true
 *   workspace_id?: string,
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrTabCreate, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const body = await req.json();
    const result = await herdrTabCreate({
      label: body.label ?? null,
      cwd: body.cwd ?? null,
      env: body.env ?? {},
      focus: body.focus ?? true,
      workspace_id: body.workspace_id ?? null,
    });
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof HerdrRpcError ? e.message : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
