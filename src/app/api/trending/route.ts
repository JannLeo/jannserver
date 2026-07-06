import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface TrendingRepo {
  name: string;
  href: string;
  description: string;
  language: string;
  languageColor: string;
  stars: string;
  todayStars: string;
  forks?: string;
}

const translateCache = new Map<string, string>();

interface MyMemoryResponse {
  responseData: { translatedText: string };
  responseStatus: number;
}

function isEnglish(text: string): boolean {
  if (!text || text.length < 10) return false;
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return false;
  return true;
}

async function translateText(text: string): Promise<string> {
  if (translateCache.has(text)) return translateCache.get(text)!;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data: MyMemoryResponse = await res.json();
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

  // Each repo is inside <article class="Box-row">...</article>
  const articleRegex = /<article\b[^>]*class="[^"]*\bBox-row\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;

  let articleMatch: RegExpExecArray | null;
  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const block = articleMatch[1];

    // Extract name & href from <h2> block
    const h2Match = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(block);
    let name = '';
    let href = '';
    if (h2Match) {
      const h2Content = h2Match[1];
      // Find the repo link (first a with href starting with /)
      const linkMatch = /<a\b[^>]*href="(\/[^"?#\s]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(h2Content);
      if (linkMatch) {
        href = linkMatch[1];
        // Get ALL text content from the link, stripping all tags
        const inner = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        // Clean up spaces around slash
        name = inner.replace(/ \/ /g, '/').replace(/\/ /g, '/').replace(/ \//g, '/');
      }
    }

    if (!name) continue;

    // description: <p class="col-9 color-fg-muted ..."> — not the first <p> (sponsor btn comes first)
    const pMatch = /<p[^>]*color-fg-muted[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const description = pMatch
      ? pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : '';

    // language
    const langMatch = /<span[^>]*itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/i.exec(block);
    const language = langMatch ? langMatch[1].trim() : '';
    const colorMatch = /<span[^>]*itemprop="programmingLanguage"[^>]*style="color:\s*(#[a-f0-9]+)"/i.exec(block);
    const languageColor = colorMatch ? colorMatch[1] : '#6e7681';

    // stars
    const starsMatch = /<a[^>]+href="[^"]*\/stargazers\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const stars = starsMatch
      ? starsMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : '';

    // today's stars
    const todayMatch = /class="[^"]*float-sm-right[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i.exec(block) ||
      /class="[^"]*d-inline-block[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i.exec(block);
    const todayStars = todayMatch
      ? todayMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : '';

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

    // Translate descriptions to Chinese
    const translatedRepos = await Promise.all(
      repos.map(async (repo) => ({
        ...repo,
        description: isEnglish(repo.description)
          ? await translateText(repo.description)
          : repo.description,
      }))
    );

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