// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { syncBrainAlphas } from '@/lib/brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  try {
    console.log('[brain/sync] starting (background)...');
    // 立即返回 202，避免 Cloudflare tunnel 100s 上限
    // 同步在后台进行，UI 轮询 status 端点
    const backgroundTask = (async () => {
      try {
        const result = await syncBrainAlphas();
        console.log('[brain/sync] background result:', JSON.stringify(result).slice(0, 300));
      } catch (err: any) {
        console.error('[brain/sync] background error:', err.message);
      }
    })();
    // 释放 detached，避免 next.js 在请求结束时 await
    backgroundTask.catch(() => {});

    return NextResponse.json({ ok: true, status: 'started', message: '同步已启动，请轮询 /api/brain/status' });
  } catch (err: any) {
    console.error('[brain/sync] error:', err.message, err.stack);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}