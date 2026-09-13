import { NextRequest, NextResponse } from 'next/server';

const AI_BASE_URL = (process.env.AI_BASE_URL || 'http://127.0.0.1:12345/v1').trim();
const AI_API_KEY = (process.env.AI_API_KEY || '').trim();
const AI_MODEL = (process.env.AI_MODEL || 'MiniMax-M2.7').trim();

/**
 * POST /api/stock/ai-signal
 * Body: { symbol: string, marketData?: {price, change, change_pct, volume, name} }
 * Returns: { signal: 'BUY'|'SELL'|'HOLD', confidence, reasoning, analysis }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = body.symbol;
    if (!symbol) return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });

    const md = body.marketData || {};
    const prompt = `You are a professional stock trading analyst. Analyze the following stock and provide a trading signal.

Stock: ${md.name || symbol} (${symbol})
Current Price: ${md.price || 'N/A'}
Change: ${md.change || 'N/A'} (${md.change_pct || 'N/A'}%)
Volume: ${md.volume || 'N/A'}

Based on this data, provide:
1. A trading signal: BUY, SELL, or HOLD
2. Confidence level: HIGH, MEDIUM, or LOW
3. Brief reasoning (2-3 sentences)

Respond in JSON format:
{"signal":"BUY|SELL|HOLD","confidence":"HIGH|MEDIUM|LOW","reasoning":"..."}

Keep reasoning concise and in Chinese if the stock is A-share (symbol starts with a digit).`;

    if (!AI_BASE_URL || !AI_API_KEY) {
      return NextResponse.json({
        error: 'AI API not configured. Set AI_BASE_URL and AI_API_KEY in .env'
      }, { status: 503 });
    }

    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `AI API error: ${res.status} ${errText}` }, { status: 502 });
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || '';
    const reasoning = json.choices?.[0]?.message?.reasoning_content || '';

    // Try to parse JSON from content
    let signal = 'HOLD';
    let confidence = 'LOW';
    let analysis = content;

    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        signal = parsed.signal || 'HOLD';
        confidence = parsed.confidence || 'LOW';
        analysis = parsed.reasoning || content;
      }
    } catch {
      // If JSON parse fails, use raw content
      analysis = content || reasoning;
    }

    return NextResponse.json({
      symbol,
      signal,
      confidence,
      analysis,
      model: AI_MODEL,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
