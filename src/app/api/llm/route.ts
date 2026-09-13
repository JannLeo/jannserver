import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  
  // 禁用 Qwen 思考模式
  body.chat_template_kwargs = { enable_thinking: false };

  const res = await fetch('http://127.0.0.1:10000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return new Response(await res.text(), { status: res.status });
  }

  // 拦截 SSE 流，过滤掉 reasoning_content
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let buf = '';
  res.body!.pipeTo(new WritableStream({
    write(chunk) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) {
          writer.write(encoder.encode(line + '\n'));
          continue;
        }
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          writer.write(encoder.encode(line + '\n'));
          continue;
        }
        try {
          const j = JSON.parse(payload);
          if (j.choices?.[0]?.delta?.reasoning_content) {
            // 把 reasoning_content 挪到 content，然后删除 reasoning_content
            const reasoning = j.choices[0].delta.reasoning_content;
            if (!j.choices[0].delta.content) {
              j.choices[0].delta.content = reasoning;
            }
            delete j.choices[0].delta.reasoning_content;
          }
          writer.write(encoder.encode('data: ' + JSON.stringify(j) + '\n\n'));
        } catch {
          writer.write(encoder.encode(line + '\n'));
        }
      }
    },
    close() {
      // 处理剩余 buf
      if (buf.trim()) writer.write(encoder.encode(buf + '\n'));
      writer.close();
    },
  }));

  return new Response(readable, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'text/event-stream',
    },
  });
}
