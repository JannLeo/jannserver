import { NextRequest, NextResponse } from 'next/server';
import { proxyFetchText } from '@/lib/proxy-fetch';

export const dynamic = 'force-dynamic';

interface TrendingRepo {
  name: string;
  href: string;
  description: string;
  language: string;
  languageColor: string;
  stars: string;
  todayStars: string;
}

const LLM_BASE_URL = (process.env.AI_BASE_URL || 'http://127.0.0.1:12345/v1').replace(/\/$/, '');
const LLM_API_KEY = process.env.AI_API_KEY || '';
const LLM_MODEL = process.env.AI_MODEL || 'MiniMax-M2';

const translateCache = new Map<string, string>();

function isEnglish(text: string): boolean {
  if (!text || text.length < 10) return false;
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return false;
  return true;
}

async function translateViaLLM(descriptions: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (!LLM_API_KEY || !LLM_BASE_URL || descriptions.length === 0) return results;

  const toTranslate = descriptions.filter(d => isEnglish(d) && !translateCache.has(d) && !results.has(d));
  if (toTranslate.length === 0) return results;

  // Batch in groups of 8
  for (let i = 0; i < toTranslate.length; i += 8) {
    const batch = toTranslate.slice(i, i + 8);
    const lines = batch.map((t, idx) => `${idx}: ${t.replace(/\n/g, ' ')}`).join('\n');
    const systemPrompt = 'You are a professional English-to-Chinese translator. Translate the following English texts to Simplified Chinese. Return ONLY a valid JSON object where keys are numeric indices (0, 1, 2...) and values are the Chinese translations. Example: {"0": "中文", "1": "中文2"}.';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LLM_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Translate these ${batch.length} texts:\n${lines}` },
          ],
          temperature: 0.1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const content: string = data.choices?.[0]?.message?.content || '';
        let parsed: Record<string, string> = {};
        try { parsed = JSON.parse(content); }
        catch {
          const match = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
          if (match) try { parsed = JSON.parse(match[1]); } catch { /* ignore */ }
        }
        batch.forEach((text, idx) => {
          const translated = parsed[String(idx)];
          if (translated) {
            results.set(text, translated);
            translateCache.set(text, translated);
          }
        });
      }
    } catch (err) {
      console.warn('[Trending] LLM translation batch failed:', err);
    }

    if (i + 8 < toTranslate.length) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

async function translateViaMyMemory(text: string): Promise<string> {
  if (translateCache.has(text)) return translateCache.get(text)!;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data: any = await res.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const t = data.responseData.translatedText;
        translateCache.set(text, t);
        return t;
      }
    }
  } catch {}
  return text;
}

async function fetchGitHubTrending(since: string): Promise<TrendingRepo[]> {
  const url = `https://github.com/trending?since=${since}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`GitHub trending fetch failed: ${res.status}`);

  const html = await res.text();
  const repos: TrendingRepo[] = [];

  const articleRegex = /<article\b[^>]*class="[^"]*\bBox-row\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let articleMatch: RegExpExecArray | null;
  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const block = articleMatch[1];

    const h2Match = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(block);
    let name = '', href = '';
    if (h2Match) {
      const linkMatch = /<a\b[^>]*href="(\/[^"?#\s]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(h2Match[1]);
      if (linkMatch) {
        href = linkMatch[1];
        name = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
          .replace(/ \/ /g, '/').replace(/\/ /g, '/').replace(/ \//g, '/');
      }
    }
    if (!name) continue;

    const pMatch = /<p[^>]*color-fg-muted[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const description = pMatch ? pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

    const langMatch = /<span[^>]*itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/i.exec(block);
    const language = langMatch ? langMatch[1].trim() : '';
    const colorMatch = /<span[^>]*itemprop="programmingLanguage"[^>]*style="color:\s*(#[a-f0-9]+)"/i.exec(block);
    const languageColor = colorMatch ? colorMatch[1] : '#6e7681';

    const starsMatch = /<a[^>]+href="[^"]*\/stargazers\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const stars = starsMatch ? starsMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

    const todayMatch = /class="[^"]*float-sm-right[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i.exec(block) ||
      /class="[^"]*d-inline-block[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i.exec(block);
    const todayStars = todayMatch ? todayMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

    repos.push({ name, href, description, language, languageColor, stars, todayStars });
  }
  return repos;
}

// GET /api/trending?since=daily|weekly|monthly
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since') ?? 'weekly';

  try {
    const repos = await fetchGitHubTrending(since);

    // Collect all descriptions that need translation
    const descsToTranslate = repos
      .filter(r => isEnglish(r.description) && !translateCache.has(r.description))
      .map(r => r.description);

    // Translate via LLM in batch
    const llmResults = await translateViaLLM(descsToTranslate);

    // Apply translations
    const translatedRepos = repos.map(repo => {
      let desc = repo.description;
      if (isEnglish(desc)) {
        if (llmResults.has(desc)) {
          desc = llmResults.get(desc)!;
        } else if (translateCache.has(desc)) {
          desc = translateCache.get(desc)!;
        } else {
          // MyMemory fallback
          translateViaMyMemory(desc).then(t => { if (t !== desc) translateCache.set(desc, t); });
        }
      }
      return { ...repo, description: desc };
    });

    return NextResponse.json({
      repos: translatedRepos,
      since,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch trending', repos: [] },
      { status: 502 }
    );
  }
}
