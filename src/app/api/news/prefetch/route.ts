// News pre-fetch + cache refresh endpoint
// GET  /api/news/prefetch          — 手动触发一次预刷新
// cron 调用，或手动访问即可刷新缓存

import { XMLParser } from 'fast-xml-parser';
import { proxyFetchText } from '@/lib/proxy-fetch';
import { sqlite } from '@/lib/db/index';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const FEEDS = [
  { name: 'BBC World',      url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                category: 'world', lang: 'en' },
  { name: 'CNN World',      url: 'https://rss.cnn.com/rss/edition_world.rss',                  category: 'world', lang: 'en' },
  { name: 'AP News',        url: 'https://apnews.com/rss',                                    category: 'world', lang: 'en' },
  { name: 'NPR News',       url: 'https://feeds.npr.org/1001/rss.xml',                          category: 'world', lang: 'en' },
  { name: 'Al Jazeera',     url: 'https://www.aljazeera.com/xml/rss/all.xml',                   category: 'world', lang: 'en' },
  { name: 'France 24',      url: 'https://www.france24.com/en/rss',                            category: 'world', lang: 'en' },
  { name: 'DW News',        url: 'https://rss.dw.com/xml/rss-en-all',                          category: 'world', lang: 'en' },
  { name: 'The Guardian',   url: 'https://www.theguardian.com/world/rss',                      category: 'world', lang: 'en' },
  { name: 'TechCrunch',     url: 'https://techcrunch.com/feed/',                               category: 'tech',  lang: 'en' },
  { name: 'Ars Technica',   url: 'https://feeds.arstechnica.com/arstechnica/index',            category: 'tech',  lang: 'en' },
  { name: 'Hacker News',    url: 'https://hnrss.org/frontpage',                               category: 'tech',  lang: 'en' },
  { name: 'The Verge',      url: 'https://www.theverge.com/rss/index.xml',                     category: 'tech',  lang: 'en' },
  { name: 'WSJ',            url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',               category: 'finance',lang: 'en' },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry'].includes(name),
});

const TIMEOUT_MS = 10000;
const MAX_ITEMS = 80;

interface NewsItem {
  title: string; link: string; description: string;
  pubDate: string; source: string; category: string;
}

const LANG_RE = /^[\x20-\x7E\s,.;:!?()'"\-–—…]+$/;
const translateCache = new Map<string, string>();

function isEnglish(text: string): boolean {
  if (!text || text.length < 6) return false;
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return false;
  return true;
}

async function translateText(text: string): Promise<string> {
  const cached = translateCache.get(text);
  if (cached) return cached;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`;
    const raw = await proxyFetchText(url, 8000);
    const data = JSON.parse(raw) as { responseData?: { translatedText?: string }; responseStatus?: number };
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      translateCache.set(text, data.responseData.translatedText);
      return data.responseData.translatedText;
    }
  } catch { /* ignore */ }
  return text;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    .replace(/"/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function fetchFeed(feed: { name: string; url: string; category: string }): Promise<NewsItem[]> {
  try {
    const xml = await proxyFetchText(feed.url, TIMEOUT_MS);
    const parsed = parser.parse(xml);
    const channel = parsed?.rss?.channel;
    if (channel) {
      const items: any[] = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
      return items.map((item: any) => ({
        title: item.title?.['#text'] ?? item.title ?? '',
        link: item.link?.['#text'] ?? item.link ?? '',
        description: stripHtml(item.description?.['#text'] ?? item.description ?? ''),
        pubDate: item.pubDate ?? '',
        source: feed.name, category: feed.category,
      }));
    }
    const feedNode = parsed?.feed;
    if (feedNode) {
      const entries: any[] = Array.isArray(feedNode.entry) ? feedNode.entry : feedNode.entry ? [feedNode.entry] : [];
      return entries.map((entry: any) => ({
        title: entry.title?.['#text'] ?? entry.title ?? '',
        link: Array.isArray(entry.link)
          ? entry.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href']
          : entry.link?.['@_href'] ?? entry.link ?? '',
        description: stripHtml(entry.summary?.['#text'] ?? entry.summary ?? entry.content?.['#text'] ?? entry.content ?? ''),
        pubDate: entry.updated ?? entry.published ?? '',
        source: feed.name, category: feed.category,
      }));
    }
    return [];
  } catch { return []; }
}

function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter(i => {
    const key = i.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function translateItems(items: NewsItem[]): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  for (let i = 0; i < items.length; i += 5) {
    const batch = items.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const [newTitle, newDesc] = await Promise.all([
          isEnglish(item.title) ? translateText(item.title) : item.title,
          isEnglish(item.description) ? translateText(item.description.slice(0, 300)) : item.description,
        ]);
        return { ...item, title: newTitle, description: newDesc };
      })
    );
    results.push(...batchResults);
    if (i + 5 < items.length) await new Promise(r => setTimeout(r, 400));
  }
  return results;
}

async function writeToDb(items: NewsItem[], originalTitles: string[], originalDescs: string[]) {
  try {
    const raw: any = sqlite;
    const insert = raw.prepare(`
      INSERT INTO cached_news (title, link, source, pub_date, description, translated_title, translated_description, is_translated, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(link) DO UPDATE SET
        title = excluded.title,
        source = excluded.source,
        pub_date = excluded.pub_date,
        description = excluded.description,
        translated_title = excluded.translated_title,
        translated_description = excluded.translated_description,
        is_translated = 1,
        cached_at = datetime('now')
    `);
    const tx = raw.transaction(() => {
      // Clear old items first (keep latest MAX_ITEMS * 2)
      raw.prepare(`DELETE FROM cached_news WHERE id NOT IN (SELECT id FROM cached_news ORDER BY cached_at DESC LIMIT ${MAX_ITEMS * 2})`).run();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const originalTitle = i < originalTitles.length ? originalTitles[i] : item.title;
        const originalDesc = i < originalDescs.length ? originalDescs[i] : item.description;
        // description field = Chinese (translated), for direct display
        // translated_description field = Chinese (explicit), for clarity
        // original English is stored in title field (via originalTitles) but we don't have a dedicated orig_desc column
        insert.run(originalTitle, item.link, item.source, item.pubDate, item.description, item.title, item.description);
      }
    });
    tx();
    return items.length;
  } catch (e) {
    console.error('[news.prefetch] DB write error:', e);
    return 0;
  }
}

export async function GET(req: Request) {
  console.log('[news.prefetch] Starting fetch at', new Date().toISOString());

  // 1. Fetch all feeds
  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
  let items: NewsItem[] = results
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);

  items = dedupe(items);
  items.sort((a, b) => (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0));
  items = items.slice(0, MAX_ITEMS);

  // 2. Translate all (batch, with delay) — preserve original English first
  const originalTitles = items.map(i => i.title);
  const originalDescs = items.map(i => i.description);
  const translated = await translateItems(items);

  // 3. Write to DB (original English → title, Chinese translation → translated_title + translated_description)
  const written = await writeToDb(translated, originalTitles, originalDescs);

  // 4. Return summary
  return Response.json({
    ok: true,
    total: items.length,
    written,
    fetchedAt: new Date().toISOString(),
  });
}