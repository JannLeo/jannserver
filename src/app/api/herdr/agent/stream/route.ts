/**
 * GET /api/herdr/agent/stream — SSE stream for agent output
 * Query: ?agentId=xxx
 *
 * Polls agent.read every ~1s and streams new output via SSE.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rpcMethod, HerdrRpcError } from '@/lib/herdr-socket';
import { herdrAuth } from '@/lib/herdr-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await herdrAuth(req);
  if (!auth.ok) return auth.error;

  const agentId = req.nextUrl.searchParams.get('agentId')?.trim() || '';
  if (!agentId || agentId.length > 200) {
    return NextResponse.json({ error: '无效的 agentId' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let polling = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      let lastOutput = '';

      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          const result = await rpcMethod<any>('agent.read', { target: agentId, lines: 50, source: 'recent' });
          const output = result?.read?.text || result?.output || result?.content || result || '';

          if (typeof output === 'string' && output !== lastOutput) {
            // If the upstream result was truncated/rotated, send the full current
            // snapshot rather than slicing with an invalid previous offset.
            const newPart = output.startsWith(lastOutput) ? output.slice(lastOutput.length) : output;
            if (newPart.trim()) {
              send(JSON.stringify({ type: 'output', content: newPart, agentId }));
            }
            lastOutput = output;
          }

          const agent = await rpcMethod<any>('agent.get', { target: agentId }).catch(() => null);
          if (agent) {
            send(JSON.stringify({ type: 'status', content: agent.agent_status, agentId }));
          }
        } catch (error) {
          const message = error instanceof HerdrRpcError
            ? error.message
            : (error instanceof Error ? error.message : String(error));
          send(JSON.stringify({ type: 'error', content: `poll error: ${message}`, agentId }));
        } finally {
          polling = false;
        }
      };

      await poll();
      if (!closed) intervalId = setInterval(poll, 1000);
      send(JSON.stringify({ type: 'heartbeat', agentId, time: Date.now() }));
    },

    cancel() {
      closed = true;
      if (intervalId) clearInterval(intervalId);
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
