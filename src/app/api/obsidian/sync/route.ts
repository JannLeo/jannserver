// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { syncObsidianVault } from '@/lib/obsidian';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const vaultPath = body.vaultPath || process.env.OBSIDIAN_VAULT_DIR;
    if (!vaultPath) {
      return NextResponse.json(
        { ok: false, error: 'vaultPath not provided and OBSIDIAN_VAULT_DIR not set' },
        { status: 400 }
      );
    }
    const result = await syncObsidianVault(vaultPath);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
