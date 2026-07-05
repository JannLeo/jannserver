// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db, sqlite } from '@/lib/db/index';
import { brainAlphas } from '@/lib/db/schema';
import { eq, and, isNotNull, desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getAiConfig() {
  return {
    baseUrl: (process.env.AI_BASE_URL || '').trim(),
    apiKey: (process.env.AI_API_KEY || '').trim(),
    model: (process.env.AI_MODEL || '').trim() || 'deepseek-chat',
  };
}

function getAlphaInfo(alphaId: string) {
  try {
    return db.select().from(brainAlphas).where(eq(brainAlphas.id, alphaId)).get() || null;
  } catch { return null; }
}

function getTopAlphas(limit = 5) {
  try {
    const rows = sqlite.prepare(`
      SELECT id, grade, fitness, sharpe, turnover, returns, drawdown, expression, settings_json
      FROM brain_alphas
      WHERE fitness IS NOT NULL AND fitness != '' AND CAST(fitness AS REAL) >= 1.0
      ORDER BY CAST(fitness AS REAL) DESC
      LIMIT ?
    `).all(limit);
    return rows;
  } catch { return []; }
}

function getSpectacularAlphas(limit = 10) {
  try {
    return db.select().from(brainAlphas).where(eq(brainAlphas.grade, 'SPECTACULAR')).orderBy(desc(brainAlphas.fitness)).limit(limit).all();
  } catch { return []; }
}

function buildResearchPrompt(query: string, alphaId?: string, expression?: string) {
  let context = '';

  if (alphaId) {
    const alpha = getAlphaInfo(alphaId);
    if (alpha) {
      context += `## Target Alpha (ID: ${alpha.id})\n`;
      context += `- Grade: ${alpha.grade || 'N/A'}, Fitness: ${alpha.fitness || 'N/A'}, Sharpe: ${alpha.sharpe || 'N/A'}\n`;
      context += `- Expression: ${alpha.expression || 'N/A'}\n`;
      context += `- Status: ${alpha.status || 'N/A'}, Stage: ${alpha.stage || 'N/A'}\n`;
      context += `- Turnover: ${alpha.turnover || 'N/A'}, Returns: ${alpha.returns || 'N/A'}, Drawdown: ${alpha.drawdown || 'N/A'}\n`;
      try {
        if (alpha.settings_json) {
          const settings = JSON.parse(alpha.settings_json);
          context += `- Settings: universe=${settings.universe}, delay=${settings.delay}, decay=${settings.decay}, neutralization=${settings.neutralization}\n`;
        }
      } catch {}
      context += '\n';
    }
  }

  if (expression) {
    context += `## Expression to Research\n${expression}\n\n`;
  }

  const tops = getTopAlphas(3);
  if (tops.length > 0) {
    context += `## Top Performing Alphas in Portfolio\n`;
    tops.forEach((a: any) => {
      context += `- [${a.grade || '?'}] f=${a.fitness} s=${a.sharpe} exp=${(a.expression || '').slice(0, 80)}\n`;
    });
    context += '\n';
  }

  return `${context}## Research Query\n${query}\n\n## Task\n请进行深度研究，围绕上述查询展开分析。需要：\n1. 从多个角度（学术、业界、新闻）收集相关信息\n2. 结合 Alpha 数据（如果有）进行量化分析\n3. 给出具体、可操作的结论和建议\n4. 引用真实的数据来源\n\n请用中文输出，结构清晰，分点论述，重点突出与 WorldQuant BRAIN Alpha 开发的关联。`;
}

// GET: 返回可用研究模式
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode');

  if (mode === 'alphas') {
    try {
      const specs = getSpectacularAlphas(20);
      const tops = getTopAlphas(10);
      return NextResponse.json({
        spectacular: specs.map((a: any) => ({
          id: a.id, grade: a.grade, fitness: a.fitness, sharpe: a.sharpe,
          expression: (a.expression || '').slice(0, 80),
        })),
        topFitness: tops.map((a: any) => ({
          id: a.id, grade: a.grade, fitness: a.fitness, sharpe: a.sharpe,
          expression: (a.expression || '').slice(0, 80),
        })),
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    modes: ['alpha_detail', 'expression_research', 'market_research'],
    description: 'POST with query/alphaId/expression to start streaming research',
  });
}

// POST: 流式深度研究
export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { query, alphaId, expression, mode } = body;

  if (!query && !alphaId && !expression) {
    return NextResponse.json({ error: '需要提供 query / alphaId / expression 之一' }, { status: 400 });
  }

  let researchQuery = query || '';
  if (!researchQuery && alphaId) {
    const alpha = getAlphaInfo(alphaId);
    if (!alpha) return NextResponse.json({ error: 'Alpha not found' }, { status: 404 });
    researchQuery = `对 Alpha ${alphaId} (grade=${alpha.grade}, fitness=${alpha.fitness}) 进行深度分析。\n表达式: ${alpha.expression}\n请从以下角度研究：\n1. 表达式设计逻辑与因子来源\n2. 在中国 A 股市场的适用性分析\n3. 与其他优秀因子的对比\n4. 可能的改进方向`;
  }
  if (!researchQuery && expression) {
    researchQuery = `分析以下 WQ Alpha 表达式：\n${expression}\n请提供：\n1. 表达式结构解析\n2. 因子逻辑推断（动量/反转/波动率/其他）\n3. 潜在问题和改进建议\n4. 同类因子的市场表现`;
  }

  const fullPrompt = buildResearchPrompt(researchQuery, alphaId, expression);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const encode = (text: string, extra?: object) => {
        const payload = { content: text, ...extra };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const ai = getAiConfig();
      if (!ai.baseUrl || !ai.apiKey) {
        encode('[错误] AI 未配置（AI_BASE_URL / AI_API_KEY 未设置）', { error: true });
        controller.close();
        return;
      }

      const messages = [
        {
          role: 'system',
          content: '你是一位专业的量化金融研究员，专注于 WorldQuant BRAIN Alpha 开发研究。擅长分析 Alpha 表达式、评估因子质量、提供改进建议。回答要专业、精确、数据驱动，用中文输出。'
        },
        { role: 'user', content: fullPrompt }
      ];

      try {
        const res = await fetch(`${ai.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ai.apiKey}` },
          body: JSON.stringify({ model: ai.model, messages, stream: true, temperature: 0.3, max_tokens: 4096 }),
        });

        if (!res.ok) {
          const err = await res.text();
          encode(`[AI 错误] HTTP ${res.status}: ${err.slice(0, 300)}`, { error: true });
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { encode('[错误] 无法读取响应流', { error: true }); controller.close(); return; }

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) encode(content);
            } catch {}
          }
        }
      } catch (err: any) {
        encode(`[错误] ${err.message}`, { error: true });
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}