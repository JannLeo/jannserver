import { load } from 'cheerio';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface TrendingRepo {
  name: string;       // "owner/repo"
  href: string;       // "/owner/repo"
  description: string;
  language: string;
  languageColor: string;
  stars: string;      // "1,234"
  todayStars: string; // "+123"
  forks?: string;     // forks count
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
    return NextResponse.json({
      repos,
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