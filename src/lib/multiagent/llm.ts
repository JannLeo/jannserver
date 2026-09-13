// ─── AI/LLM Calling Utilities ─────────────────────────────────────────────────

interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface LlmResponse {
  content: string;
  raw: any;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** 从环境变量获取 AI 配置 */
export function getAiConfig(): LlmConfig {
  return {
    baseUrl: (process.env.AI_BASE_URL || '').trim(),
    apiKey: (process.env.AI_API_KEY || '').trim(),
    model: (process.env.AI_MODEL || '').trim() || 'deepseek-chat',
  };
}

/** 调用 LLM，返回文本内容 */
export async function callLlm(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    config?: LlmConfig;
  } = {}
): Promise<LlmResponse> {
  const config = options.config || getAiConfig();

  if (!config.baseUrl || !config.apiKey) {
    throw new Error('AI 未配置（AI_BASE_URL / AI_API_KEY 未设置）');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AI API 返回 ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      raw: data,
      usage: data.usage,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('AI 请求超时（120s）');
    }
    throw err;
  }
}

/** 调用 LLM，流式返回 */
export async function* streamLlm(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    config?: LlmConfig;
  } = {}
): AsyncGenerator<string, void, unknown> {
  const config = options.config || getAiConfig();

  if (!config.baseUrl || !config.apiKey) {
    throw new Error('AI 未配置');
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI API 返回 ${res.status}: ${errText.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) yield content;
      } catch {}
    }
  }
}