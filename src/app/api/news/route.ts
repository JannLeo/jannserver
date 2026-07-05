import { XMLParser } from 'fast-xml-parser';
import { getIronSession } from 'iron-session';

export const dynamic = 'force-dynamic';

const FEEDS = [
  {
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    category: 'world',
    lang: 'en',
  },
  {
    name: 'CNN World',
    url: 'https://rss.cnn.com/rss/edition_world.rss',
    category: 'world',
    lang: 'en',
  },
  {
    name: 'Reuters World',
    url: 'https://www.reutersagency.com/feed/?best-topics=world-news&post_type=best',
    category: 'world',
    lang: 'en',
  },
  {
    name: 'AP News',
    url: 'https://apnews.com/rss',
    category: 'world',
    lang: 'en',
  },
  {
    name: 'NPR News',
    url: 'https://feeds.npr.org/1001/rss.xml',
    category: 'world',
    lang: 'en',
  },
  {
    name: 'The Guardian',
    url: 'https://www.theguardian.com/world/rss',
    category: 'world',
    lang: 'en',
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    category: 'tech',
    lang: 'en',
  },
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    category: 'tech',
    lang: 'en',
  },
  {
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    category: 'tech',
    lang: 'en',
  },
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    category: 'tech',
    lang: 'en',
  },
  {
    name: 'Wall Street Journal',
    url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
    category: 'finance',
    lang: 'en',
  },
  {
    name: 'Financial Times',
    url: 'https://www.ft.com/rss/home',
    category: 'finance',
    lang: 'en',
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    category: 'world',
    lang: 'en',
  },
  {
    name: 'France 24',
    url: 'https://www.france24.com/en/rss',
    category: 'world',
    lang: 'en',
  },
  {
    name: 'DW News',
    url: 'https://rss.dw.com/xml/rss-en-all',
    category: 'world',
    lang: 'en',
  },
];

export interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category: string;
}

export interface NewsResponse {
  items: NewsItem[];
  fetchedAt: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry'].includes(name),
});

const TIMEOUT_MS = 8000;

async function fetchFeed(feed: { name: string; url: string; category: string; lang: string }): Promise<NewsItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JannWorkspace/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) return [];

    const xml = await res.text();
    const parsed = parser.parse(xml);

    // RSS 2.0
    const channel = parsed?.rss?.channel;
    if (channel) {
      const items: any[] = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
      return items.map((item: any) => ({
        title: item.title?.['#text'] ?? item.title ?? '',
        link: item.link?.['#text'] ?? item.link ?? '',
        description: stripHtml(item.description?.['#text'] ?? item.description ?? ''),
        pubDate: item.pubDate ?? item['dc:creator'] ?? '',
        source: feed.name,
        category: feed.category,
      }));
    }

    // Atom
    const feed_node = parsed?.feed;
    if (feed_node) {
      const entries: any[] = Array.isArray(feed_node.entry) ? feed_node.entry : feed_node.entry ? [feed_node.entry] : [];
      return entries.map((entry: any) => ({
        title: entry.title?.['#text'] ?? entry.title ?? '',
        link: Array.isArray(entry.link)
          ? entry.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href']
          : entry.link?.['@_href'] ?? entry.link ?? '',
        description: stripHtml(entry.summary?.['#text'] ?? entry.summary ?? entry.content?.['#text'] ?? entry.content ?? ''),
        pubDate: entry.updated ?? entry.published ?? '',
        source: feed.name,
        category: feed.category,
      }));
    }

    return [];
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function deduplicate(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10), 100);

  const selectedFeeds = category
    ? FEEDS.filter((f) => f.category === category)
    : FEEDS;

  // Fetch all feeds concurrently
  const results = await Promise.allSettled(selectedFeeds.map((feed) => fetchFeed(feed)));

  let items: NewsItem[] = results
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  items = deduplicate(items);

  // Sort by pubDate (newest first)
  items.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime() || 0;
    const dateB = new Date(b.pubDate).getTime() || 0;
    return dateB - dateA;
  });

  items = items.slice(0, limit);

  return Response.json({
    items,
    fetchedAt: new Date().toISOString(),
    total: items.length,
  });
}