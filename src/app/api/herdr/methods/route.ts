/**
 * POST /api/herdr/methods
 * Restricted JSON-RPC gateway for known Herdr operations.
 *
 * Security: requires workspace session or x-herdr-key and only forwards methods
 * explicitly listed below. Newly-added Herdr methods are denied by default.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rpcMethod, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

const ALLOWED_METHODS = new Set([
  'ping',
  'agent.list',
  'agent.get',
  'agent.read',
  'agent.explain',
  'agent.focus',
  'agent.rename',
  'agent.send',
  'pane.list',
  'pane.get',
  'pane.read',
  'pane.current',
  'pane.process_info',
  'pane.focus',
  'pane.rename',
  'pane.swap',
  'pane.move',
  'pane.zoom',
  'pane.resize',
  'pane.focus_direction',
  'pane.neighbor',
  'pane.edges',
  'pane.send_text',
  'pane.send_keys',
  'pane.send_input',
  'pane.wait_for_output',
  'tab.list',
  'tab.get',
  'tab.focus',
  'tab.rename',
  'tab.move',
  'workspace.list',
  'workspace.get',
  'workspace.focus',
  'workspace.rename',
  'workspace.move',
  'worktree.list',
  'layout.export',
  'layout.set_split_ratio',
]);

const MAX_PARAMS_BYTES = 64 * 1024;
const METHOD_RE = /^[a-z][a-z0-9_.-]{0,127}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
    }

    const method = typeof body.method === 'string' ? body.method.trim() : '';
    if (!METHOD_RE.test(method)) {
      return NextResponse.json({ error: '无效的 method' }, { status: 400 });
    }

    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json(
        { error: `RPC method ${method} 未被允许` },
        { status: 403 },
      );
    }

    const params = body.params ?? {};
    if (!isPlainObject(params)) {
      return NextResponse.json({ error: 'params 必须是对象' }, { status: 400 });
    }

    const serializedParams = JSON.stringify(params);
    if (Buffer.byteLength(serializedParams, 'utf8') > MAX_PARAMS_BYTES) {
      return NextResponse.json({ error: 'params 过大' }, { status: 413 });
    }

    const result = await rpcMethod(method, params);
    return NextResponse.json(
      { result, method },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof HerdrRpcError
      ? error.message
      : (error instanceof Error ? error.message : String(error));
    const status = error instanceof HerdrRpcError ? 502 : 500;
    return NextResponse.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
