/**
 * GET /api/herdr/agent/stream — SSE stream for agent output
 * Query: ?agentId=xxx
 *
 * Polls agent.read every ~500ms and streams new output via SSE.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rpcMethod, HerdrRpcError } from '@/lib/herdr-socket';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId');

  if (!agentId) {
    return NextResponse.json({ error: '缺少 agentId' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval>;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      let lastOutput = '';

      const poll = async () => {
        if (closed) return;
        try {
          const result = await rpcMethod<any>('agent.read', { target: agentId, lines: 50, source: 'recent' });
          const output = result?.read?.text || result?.output || result?.content || result || '';

          if (output && output !== lastOutput) {
            const newPart = output.slice(lastOutput.length);
            if (newPart.trim()) {
              send(JSON.stringify({ type: 'output', content: newPart, agentId }));
            }
            lastOutput = output;
          }

          const agent = await rpcMethod<any>('agent.get', { target: agentId }).catch(() => null);
          if (agent) {
            send(JSON.stringify({ type: 'status', content: agent.agent_status, agentId }));
          }
        } catch (e) {
          const msg = e instanceof HerdrRpcError ? e.message : (e instanceof Error ? e.message : String(e));
          send(JSON.stringify({ type: 'error', content: `poll error: ${msg}`, agentId }));
        }
      };

      await poll();
      intervalId = setInterval(poll, 1000);
      send(JSON.stringify({ type: 'heartbeat', agentId, time: Date.now() }));
    },

    cancel() {
      closed = true;
      clearInterval(intervalId);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}