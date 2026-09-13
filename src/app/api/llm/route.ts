import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LLM_URL = 'http://127.0.0.1:10000/v1/chat/completions';
const MAX_REQUEST_BYTES = 1024 * 1024;
const LLM_TIMEOUT_MS = 5 * 60 * 1000;

function rewriteSseLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data: ')) return `${line}\n`;

  const payload = trimmed.slice(6);
  if (payload === '[DONE]') return `${line}\n`;

  try {
    const event = JSON.parse(payload);
    const delta = event?.choices?.[0]?.delta;
    if (delta?.reasoning_content) {
      if (!delta.content) delta.content = delta.reasoning_content;
      delete delta.reasoning_content;
    }
    return `data: ${JSON.stringify(event)}\n\n`;
  } catch {
    return `${line}\n`;
  }
}

export async function POST(req: NextRequest) {
  const declaredLength = Number.parseInt(req.headers.get('content-length') || '0', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Unable to read request body' }, { status: 400 });
  }

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  // Disable Qwen reasoning mode at the trusted local gateway regardless of what
  // the browser sent.
  body.chat_template_kwargs = { enable_thinking: false };

  let upstream: Response;
  try {
    upstream = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('[llm-proxy] upstream unavailable', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'LLM backend unavailable' }, { status: 502 });
  }

  if (!upstream.ok) {
    // Do not pass local backend diagnostics or stack traces to browser clients.
    try { await upstream.body?.cancel(); } catch {}
    return NextResponse.json(
      { error: 'LLM backend rejected the request' },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
    );
  }

  if (!upstream.body) {
    return NextResponse.json({ error: 'LLM backend returned an empty response' }, { status: 502 });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const filterReasoning = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) controller.enqueue(encoder.encode(rewriteSseLine(line)));
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) controller.enqueue(encoder.encode(rewriteSseLine(buffer)));
    },
  });

  return new Response(upstream.body.pipeThrough(filterReasoning), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
