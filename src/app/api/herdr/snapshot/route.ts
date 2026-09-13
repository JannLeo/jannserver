import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function GET() {
  try {
    const { stdout } = await execFileAsync('herdr', ['api', 'snapshot'], { timeout: 5000 });
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
  } catch (e: any) {
    return NextResponse.json({
      error: 'herdr server 未运行或不可用',
      detail: e.message,
      version: null,
      agents: [],
      panes: [],
      tabs: [],
      workspaces: [],
      layouts: [],
    }, { status: 200 });
  }
}