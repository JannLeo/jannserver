import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { herdrAuth } from '@/lib/herdr-auth';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

export async function GET(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  try {
    const { stdout } = await execFileAsync('herdr', ['api', 'snapshot'], {
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const json = JSON.parse(stdout);
    const snapshot = json?.result?.snapshot || json;
    return NextResponse.json({
      version: snapshot.version || 'unknown',
      agents: snapshot.agents || [],
      panes: snapshot.panes || [],
      tabs: snapshot.tabs || [],
      workspaces: snapshot.workspaces || [],
      layouts: snapshot.layouts || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[herdr/snapshot]', message);
    return NextResponse.json(
      {
        error: 'herdr server 未运行或不可用',
        version: null,
        agents: [],
        panes: [],
        tabs: [],
        workspaces: [],
        layouts: [],
      },
      { status: 503 },
    );
  }
}
