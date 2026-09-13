/**
 * POST /api/herdr/agent/start
 * 启动一个新的 agent
 *
 * Body: {
 *   name: string,           // agent 名称（必填）
 *   argv: string[],         // 命令和参数，如 ["claude"]
 *   cwd?: string,           // 工作目录
 *   env?: object,           // 额外环境变量
 *   split?: "horizontal" | "vertical",
 *   focus?: boolean,
 *   tab_id?: string,
 *   workspace_id?: string,
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { herdrAgentStart, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export async function POST(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;
  try {
    const body = await req.json();

    if (!body.name || !Array.isArray(body.argv)) {
      return NextResponse.json(
        { error: 'name 和 argv 必填', usage: { name: 'string', argv: 'string[]' } },
        { status: 400 }
      );
    }

    const result = await herdrAgentStart({
      name: body.name,
      argv: body.argv,
      cwd: body.cwd ?? null,
      env: body.env ?? {},
      split: body.split ?? null,
      focus: body.focus ?? false,
      tab_id: body.tab_id ?? null,
      workspace_id: body.workspace_id ?? null,
    });

    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
