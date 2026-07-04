// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getJobDetail } from '@/lib/videoAnalysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Platform name mapping: our platform names → AiToEarn AccountType enum values
const PLATFORM_ACCOUNT_TYPE: Record<string, string> = {
  bilibili: 'bilibili',
  douyin: 'douyin',
  kuaishou: 'KWAI',
  xhs: 'xhs',
};

function buildAitoearnPayload(job: any, platforms: string[], title: string, desc: string, topics: string[]) {
  const mediaUrl = job.items?.[0]?.url || '';
  const publishAt = new Date(Date.now() + 60 * 60 * 1000);

  return {
    content: {
      title,
      body: desc || '',
      media: mediaUrl ? [{ url: mediaUrl, options: {} }] : [],
    },
    publishAt: publishAt.toISOString(),
    items: platforms.map(p => ({
      platform: PLATFORM_ACCOUNT_TYPE[p] || p,
      accountId: '',
    })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const id = parseInt(req.nextUrl.pathname.split('/').slice(-2, -1)[0], 10);
    if (isNaN(id)) {
      return NextResponse.json({ ok: false, error: '无效的任务 ID' }, { status: 400 });
    }

    const relayUrl = (process.env.AITO_EARN_RELAY_URL || '').trim();
    const apiKey = (process.env.AITO_EARN_API_KEY || '').trim();

    if (!relayUrl) {
      return NextResponse.json({ ok: false, error: '请先配置 AITO_EARN_RELAY_URL 环境变量' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: '请先配置 AITO_EARN_API_KEY 环境变量' }, { status: 400 });
    }

    const body = await req.json();
    const { platforms, title, desc, topics } = body as {
      platforms: string[];
      title: string;
      desc: string;
      topics: string[];
    };

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json({ ok: false, error: '请选择至少一个平台' }, { status: 400 });
    }

    if (!title?.trim()) {
      return NextResponse.json({ ok: false, error: '标题不能为空' }, { status: 400 });
    }

    const detail = getJobDetail(id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: '任务不存在' }, { status: 404 });
    }

    const payload = buildAitoearnPayload(
      detail,
      platforms,
      title.trim(),
      desc?.trim() || '',
      topics || []
    );

    const flowUrl = `${relayUrl.replace(/\/$/, '')}/v2/channels/publish/flows`;
    let flowRes: Response;
    try {
      flowRes = await fetch(flowUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      });
    } catch (fetchErr: any) {
      return NextResponse.json({
        ok: false,
        error: `无法连接到 AiToEarn 服务器 (${fetchErr.message})。请检查 AITO_EARN_RELAY_URL 是否正确。`,
      }, { status: 502 });
    }

    const flowData = await flowRes.json().catch(() => ({}));

    if (!flowRes.ok) {
      return NextResponse.json({
        ok: false,
        error: `AiToEarn 返回错误 (${flowRes.status}): ${JSON.stringify(flowData).slice(0, 200)}`,
      }, { status: 502 });
    }

    // AiToEarn always returns HTTP 200; business-level code is in body
    const bizCode = flowData?.code ?? 0;
    if (bizCode === 15021) {
      // Account not found — user hasn't bound this platform's account in AiToEarn
      return NextResponse.json({
        ok: false,
        error: `平台账号未绑定：请先在 AiToEarn 后台 → 账号管理 中绑定你的 ${platforms.join('/')} 账号，然后重试。`,
        bizCode,
        flowData,
      }, { status: 400 });
    }
    if (bizCode !== 0 && bizCode !== 200) {
      return NextResponse.json({
        ok: false,
        error: `${flowData?.message || `AiToEarn 业务错误 (code: ${bizCode})`}`,
        bizCode,
        flowData,
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      flowId: flowData.id || flowData.flowId || flowData.data?.id,
      message: `发布 Flow 已创建成功！`,
      bizCode,
      platforms,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}