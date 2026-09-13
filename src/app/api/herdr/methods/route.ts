/**
 * POST /api/herdr/methods
 * Generic JSON-RPC gateway — forwards any valid herdr method.
 *
 * Security: requires x-herdr-key (or local).
 *
 * Body: { method: string, params?: object }
 *
 * ⚠️  DANGEROUS OPERATIONS are blocked:
 *   - server.stop          (irreversible — shuts down herdr)
 *   - pane.close           (use /api/herdr/agent/stop instead, which confirms)
 *   - workspace.close      (can lose unsaved work)
 *   - plugin.unlink        (can break the session)
 *   - server.reload_config (restart side effects)
 *   - worktree.remove      (rm -rf equivalent)
 *
 * For pane.close, recommend using POST /api/herdr/agent/stop instead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rpcMethod, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

const BLOCKED_METHODS = new Set([
  'server.stop',
  'server.reload_config',
  'pane.close',          // use /agent/stop
  'workspace.close',      // irreversible
  'plugin.unlink',        // session breakage risk
  'worktree.remove',      // rm -rf equivalent
]);

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const body = await req.json();

    if (!body.method || typeof body.method !== 'string') {
      return NextResponse.json(
        { error: 'method 必填，且为字符串' },
        { status: 400 }
      );
    }

    if (BLOCKED_METHODS.has(body.method)) {
      return NextResponse.json(
        { error: `危险操作 ${body.method} 已被禁止通过此接口调用` },
        { status: 403 }
      );
    }

    const timeoutMs = body.timeout_ms ?? 5000;
    const params = body.params ?? {};

    const result = await rpcMethod(body.method, params);

    return NextResponse.json({ result, method: 'unknown' });
  } catch (e) {
    const msg = e instanceof HerdrRpcError ? e.message : (e instanceof Error ? e.message : String(e));
    const status = e instanceof HerdrRpcError ? 502 : 500;
    return NextResponse.json({ error: msg, method: 'unknown' }, { status });
  }
}
