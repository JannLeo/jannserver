import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import http from 'http';
import { proxyFetchText } from '@/lib/proxy-fetch';
import { sqlite } from '@/lib/db/index';

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
    const xml = await proxyFetchText(feed.url, TIMEOUT_MS);
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

// ─── Translation ──────────────────────────────────────────────────────────────

const LANG_RE = /^[\x20-\x7E\s,.;:!?()'"\-–—…]+$/; // pure ASCII + common punctuation
const MIN_TITLE_LEN = 6;

// In-memory cache: text -> translated
const translateCache = new Map<string, string>();

interface MyMemoryResponse {
  responseData: { translatedText: string };
  responseStatus: number;
  responseDetails: string;
}

/**
 * Check if text is mostly English (non-CJK, no Chinese chars).
 */
function isEnglish(text: string): boolean {
  if (!text || text.length < MIN_TITLE_LEN) return false;
  // If it contains any CJK character, it's already Chinese
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return false;
  // Count non-ASCII chars — if >10% non-ASCII, might be mixed
  const ascii = text.replace(/[\x20-\x7E]/g, '').length;
  return ascii < text.length * 0.3;
}

/**
 * Translate a single text via AI (bypasses proxy issues).
 * Falls back to original text on any error.
 */
async function translateText(text: string): Promise<string> {
  const cached = translateCache.get(text);
  if (cached) return cached;

  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  const aiApiKey = (process.env.AI_API_KEY || '').trim();
  const aiModel = (process.env.AI_MODEL || '').trim();

  console.log('[translate] baseUrl=' + aiBaseUrl + ' model=' + aiModel + ' keyLen=' + aiApiKey.length);

  if (!aiBaseUrl || !aiApiKey || !aiModel) {
    // fallback: try MyMemory (limited quota)
    return translateTextFallback(text);
  }

  const body = JSON.stringify({
    model: aiModel,
    messages: [
      { role: 'system', content: 'You are a professional translator. Translate the following English text to simplified Chinese. Reply ONLY with the translated text, nothing else.' },
      { role: 'user', content: text.slice(0, 500) },
    ],
    temperature: 0.1,
    max_tokens: 200,
  });

  try {
    const result = await new Promise<string>((resolve, reject) => {
      const url = new URL(`${aiBaseUrl}/chat/completions`);
      const proxy = process.env.HTTP_PROXY;
      let hostname = url.hostname;
      let port = url.port || (url.protocol === 'https:' ? '443' : '80');
      let path = url.pathname + url.search;
      if (proxy && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        try {
          const proxyUrl = new URL(proxy);
          hostname = proxyUrl.hostname;
          port = proxyUrl.port || (proxyUrl.protocol === 'https:' ? '443' : '80');
          path = `${url.protocol}//${url.host}${url.pathname}${url.search}`;
        } catch {}
      }
      const req = http.request({
        hostname, port, path,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiApiKey}`,
          'Content-Type': 'application/json',
          'Host': url.host,
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) { resolve(text); return; }
          try {
            const parsed = JSON.parse(data);
            const translated = parsed.choices?.[0]?.message?.content?.trim() || text;
            console.log('[translate] result=' + translated.slice(0, 100));
            resolve(translated);
          } catch(e) { resolve(text); }
        });
      });
      req.on('error', (e) => { console.log('[translate] req error: ' + e.message); resolve(text); });
      req.setTimeout(15000, () => { req.destroy(); resolve(text); });
      req.write(body);
      req.end();
    });
    translateCache.set(text, result);
    return result;
  } catch {
    return translateTextFallback(text);
  }
}

/** Fallback: try MyMemory (limited quota). */
async function translateTextFallback(text: string): Promise<string> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`;
    const raw = await proxyFetchText(url, 8000);
    const data = JSON.parse(raw) as MyMemoryResponse;
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText;
      translateCache.set(text, translated);
      return translated;
    }
  } catch { /* fallthrough */ }
  return text;
}

/**
 * Translate all items: title + description in parallel, rate-limited.
 */
async function translateItems(items: NewsItem[]): Promise<NewsItem[]> {
  const results: NewsItem[] = [];

  // Process in batches of 5 to avoid rate limiting
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
    // Small delay between batches to avoid rate limits
    if (i + 5 < items.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10), 100);
  const skipCache = url.searchParams.get('nocache') === '1';

  // Try DB cache first (if fresh within 30 min, and not forced skip)
  if (!skipCache) {
    try {
      const raw: any = sqlite;
      const rows = raw.prepare(`
        SELECT id, title, link, source, pub_date, translated_title, description, cached_at, is_translated
        FROM cached_news
        ORDER BY pub_date DESC, cached_at DESC
        LIMIT ?
      `).all(limit);
      if (rows && rows.length > 0) {
        const latestCachedAt = rows[0]?.cached_at ?? '';
        const isFresh = new Date(latestCachedAt).getTime() > Date.now() - 30 * 60 * 1000;

        const items = rows.map((r: any) => ({
          title: r.is_translated ? (r.translated_title ?? r.title) : r.title,
          link: r.link,
          source: r.source,
          pubDate: r.pub_date ?? r.cached_at,
          description: r.description ?? '',
          _isTranslated: !!r.is_translated,
        }));

        // If cache is stale, return cached content immediately + trigger background refresh
        if (!isFresh) {
          // Fire-and-forget: trigger prefetch in background, don't await
          fetch(new URL('/api/news/prefetch', req.url).toString()).catch(() => {});
          return Response.json({ items, fetchedAt: latestCachedAt, total: items.length, cached: true, refreshing: true });
        }

        // Even if cached, re-translate items that haven't been translated yet
        // Capture original English titles BEFORE translateItems mutates them
        const untranslatedItems = items.filter((it: any) => !it._isTranslated);
        const translatedMap: Map<string, NewsItem> = new Map();
        if (untranslatedItems.length > 0) {
          // Save original English titles
          const origTitles = untranslatedItems.map((it: any) => it.title as string);
          const translated = await translateItems(untranslatedItems as NewsItem[]);
          // translated[i] corresponds to untranslatedItems[i] which has origTitles[i]
          for (let i = 0; i < translated.length; i++) {
            translatedMap.set(origTitles[i], translated[i]);
          }
        }
        const finalItems = items.map((it: any) => {
          if (!it._isTranslated) {
            const replacement = translatedMap.get(it.title);
            if (replacement) return replacement;
          }
          return it;
        });

        return Response.json({ items: finalItems, fetchedAt: latestCachedAt, total: finalItems.length, cached: true });
      }
    } catch { /* cache miss → fall through to live fetch */ }
  }

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

  // Live fetch fallback — always translate
  const translated = await translateItems(items);
  items = translated;

  return Response.json({
    items,
    fetchedAt: new Date().toISOString(),
    total: items.length,
  });
}