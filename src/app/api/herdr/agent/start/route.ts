/**
 * POST /api/herdr/agent/start
 * 启动一个新的 agent
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrAgentStart, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function validateEnv(value: unknown): Record<string, string> | null {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 128) return null;

  const env: Record<string, string> = {};
  for (const [key, rawValue] of entries) {
    if (!ENV_KEY_RE.test(key) || typeof rawValue !== 'string' || rawValue.length > 8192) return null;
    env[key] = rawValue;
  }
  return env;
}

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const body = await req.json();
    const name = boundedString(body?.name, 100);
    const argv = Array.isArray(body?.argv) ? body.argv : null;
    const env = validateEnv(body?.env);

    if (!name || !argv || argv.length === 0 || argv.length > 64 || env === null) {
      return NextResponse.json({ error: '无效的 name、argv 或 env' }, { status: 400 });
    }
    if (argv.some((arg: unknown) => typeof arg !== 'string' || arg.length === 0 || arg.length > 4096)) {
      return NextResponse.json({ error: 'argv 必须是长度受限的字符串数组' }, { status: 400 });
    }
    if (argv.reduce((sum: number, arg: string) => sum + arg.length, 0) > 16_384) {
      return NextResponse.json({ error: 'argv 总长度过大' }, { status: 413 });
    }

    const cwd = body?.cwd == null ? null : boundedString(body.cwd, 4096);
    if (body?.cwd != null && !cwd) {
      return NextResponse.json({ error: 'cwd 无效' }, { status: 400 });
    }

    const split = body?.split ?? null;
    if (split !== null && !['horizontal', 'vertical'].includes(split)) {
      return NextResponse.json({ error: 'split 必须为 horizontal 或 vertical' }, { status: 400 });
    }

    const tabId = body?.tab_id == null ? null : boundedString(body.tab_id, 200);
    const workspaceId = body?.workspace_id == null ? null : boundedString(body.workspace_id, 200);
    if ((body?.tab_id != null && !tabId) || (body?.workspace_id != null && !workspaceId)) {
      return NextResponse.json({ error: 'tab_id 或 workspace_id 无效' }, { status: 400 });
    }

    const result = await herdrAgentStart({
      name,
      argv,
      cwd,
      env,
      split,
      focus: body?.focus === true,
      tab_id: tabId,
      workspace_id: workspaceId,
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof HerdrRpcError
      ? error.message
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
