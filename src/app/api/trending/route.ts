import { load } from 'cheerio';
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
  });

  if (!res.ok) throw new Error(`GitHub trending fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = load(html);

  const repos: TrendingRepo[] = [];

  $('article').each((_, el) => {
    const $el = $(el);

    // repo full name and href
    const h2 = $el.find('h2');
    const nameLink = h2.find('a');
    let name = nameLink.find('span').text().trim();
    if (!name) name = nameLink.text().trim();
    name = name.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
    const href = nameLink.attr('href') ?? '';

    // description
    const desc = $el.find('p').first().text().trim().replace(/\s+/g, ' ');

    // language
    const langSpan = $el.find('[itemprop="programmingLanguage"]');
    const language = langSpan.text().trim() || '';
    const languageColor = langSpan.attr('style')?.match(/color:\s*(#[a-f0-9]+)/i)?.[1] ?? '#6e7681';

    // stars
    const starsLink = $el.find('a[href*="/stargazers/"]').first();
    const stars = starsLink.text().trim().replace(/\s+/g, ' ');

    // today's stars
    const todayEl = $el.find('.float-sm-right').first();
    const todayStars = todayEl.text().trim().replace(/\s+/g, ' ');

    repos.push({ name, href, description: desc, language, languageColor, stars, todayStars });
  });

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