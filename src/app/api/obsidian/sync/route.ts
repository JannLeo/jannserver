// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { syncObsidianVault } from '@/lib/obsidian';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.vaultPath !== undefined && typeof body.vaultPath !== 'string') {
    return NextResponse.json({ ok: false, error: 'vaultPath must be a string' }, { status: 400 });
  }

  const vaultPath = typeof body.vaultPath === 'string' ? body.vaultPath.trim() : '';
  if (vaultPath.length > 1024 || vaultPath.includes('\0')) {
    return NextResponse.json({ ok: false, error: 'Invalid vaultPath' }, { status: 400 });
  }

  try {
    const result = await syncObsidianVault(vaultPath || undefined);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalidPath = message.includes('vault') || message.includes('Vault');
    console.error('[api/obsidian/sync] failed', message);
    return NextResponse.json(
      { ok: false, error: invalidPath ? message : 'Obsidian sync failed' },
      { status: invalidPath ? 400 : 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
