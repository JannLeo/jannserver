import { XMLParser } from 'fast-xml-parser';
import { proxyFetchText } from '@/lib/proxy-fetch';
import { sqlite } from '@/lib/db/index';

export const dynamic = 'force-dynamic';

const FEEDS = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'world', lang: 'en' },
  { name: 'CNN World', url: 'https://rss.cnn.com/rss/edition_world.rss', category: 'world', lang: 'en' },
  { name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?best-topics=world-news&post_type=best', category: 'world', lang: 'en' },
  { name: 'AP News', url: 'https://apnews.com/rss', category: 'world', lang: 'en' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', category: 'world', lang: 'en' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', category: 'world', lang: 'en' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech', lang: 'en' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech', lang: 'en' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech', lang: 'en' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech', lang: 'en' },
  { name: 'Wall Street Journal', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', category: 'finance', lang: 'en' },
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home', category: 'finance', lang: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'world', lang: 'en' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', category: 'world', lang: 'en' },
  { name: 'DW News', url: 'https://rss.dw.com/xml/rss-en-all', category: 'world', lang: 'en' },
];

export interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category?: string;
}

export interface NewsResponse {
  items: NewsItem[];
  fetchedAt: string;
  total: number;
  cached?: boolean;
  refreshing?: boolean;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry'].includes(name),
});

const TIMEOUT_MS = 8000;

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
        pubDate: item.pubDate ?? item['dc:creator'] ?? '',
        source: feed.name,
        category: feed.category,
      }));
    }
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
  } catch { return []; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    .replace(/"/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 300);
}

function deduplicate(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ─── LLM Translation via new-api ────────────────────────────────────────────

const LLM_BASE_URL = (process.env.AI_BASE_URL || 'http://127.0.0.1:12345/v1').replace(/\/$/, '');
const LLM_API_KEY = process.env.AI_API_KEY || '';
const LLM_MODEL = process.env.AI_MODEL || 'MiniMax-M2';

const translateCache = new Map<string, string>();

function isEnglish(text: string): boolean {
  if (!text || text.length < 6) return false;
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return false;
  return true;
}

async function translateViaLLM(items: NewsItem[]): Promise<void> {
  if (!LLM_API_KEY || !LLM_BASE_URL) {
    console.warn('[News] new-api not configured for translation, skipping LLM');
    return;
  }

  // Collect all texts needing translation, grouped by position in items array
  const texts: string[] = [];
  const positions: Array<{ itemIdx: number; field: 'title' | 'description' }> = [];

  for (let i = 0; i < items.length; i++) {
    if (isEnglish(items[i].title) && !translateCache.has(items[i].title)) {
      texts.push(items[i].title);
      positions.push({ itemIdx: i, field: 'title' });
    }
    if (isEnglish(items[i].description) && !translateCache.has(items[i].description)) {
      texts.push(items[i].description);
      positions.push({ itemIdx: i, field: 'description' });
    }
  }

  if (texts.length === 0) return;

  // Process in batches of 10
  for (let batchStart = 0; batchStart < texts.length; batchStart += 10) {
    const batchEnd = Math.min(batchStart + 10, texts.length);
    const batchTexts = texts.slice(batchStart, batchEnd);
    const batchPositions = positions.slice(batchStart, batchEnd);

    const lines = batchTexts.map((t, idx) => `${idx}: ${t.replace(/\n/g, ' ')}`).join('\n');
    const systemPrompt = 'You are a professional English-to-Chinese translator. Translate the following English texts to Simplified Chinese. Return ONLY a valid JSON object where keys are the numeric indices (0, 1, 2...) and values are the translated Chinese text. Example: {"0": "中文标题", "1": "中文描述"}.';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Translate these ${batchTexts.length} texts:\n${lines}` },
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

        for (let j = 0; j < batchPositions.length; j++) {
          const translated = parsed[String(j)];
          if (translated) {
            const pos = batchPositions[j];
            if (pos.field === 'title') {
              items[pos.itemIdx].title = translated;
            } else {
              items[pos.itemIdx].description = translated;
            }
            translateCache.set(batchTexts[j], translated);
          }
        }
      }
    } catch (err) {
      console.warn('[News] LLM batch translation failed:', err);
    }

    if (batchEnd < texts.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

async function translateFallbackMyMemory(items: NewsItem[]): Promise<void> {
  const toTranslate: Array<{ item: NewsItem; field: 'title' | 'description'; text: string }> = [];
  for (const item of items) {
    if (isEnglish(item.title) && !translateCache.has(item.title)) toTranslate.push({ item, field: 'title', text: item.title });
    if (isEnglish(item.description) && !translateCache.has(item.description)) toTranslate.push({ item, field: 'description', text: item.description });
  }
  for (let i = 0; i < toTranslate.length; i += 5) {
    const batch = toTranslate.slice(i, i + 5);
    await Promise.all(batch.map(async ({ item, field, text }) => {
      const cached = translateCache.get(text);
      if (cached) {
        if (field === 'title') item.title = cached; else item.description = cached;
        return;
      }
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`;
        const raw = await proxyFetchText(url, 8000);
        const data = JSON.parse(raw) as any;
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
          const translated = data.responseData.translatedText;
          translateCache.set(text, translated);
          if (field === 'title') item.title = translated; else item.description = translated;
        }
      } catch { /* fallback to original */ }
    }));
    if (i + 5 < toTranslate.length) await new Promise(r => setTimeout(r, 300));
  }
}

// ─── Main GET Handler ────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10), 100);
  const skipCache = url.searchParams.get('nocache') === '1';

  // DB cache check
  if (!skipCache) {
    try {
      const rows: any[] = sqlite.prepare(`
        SELECT title, link, source, pub_date, translated_title, description, cached_at, is_translated
        FROM cached_news ORDER BY pub_date DESC, cached_at DESC LIMIT ?
      `).all(limit);

      if (rows?.length > 0) {
        const latestCachedAt = rows[0]?.cached_at ?? '';
        const isFresh = new Date(latestCachedAt).getTime() > Date.now() - 30 * 60 * 1000;
        const items = rows.map((r: any) => ({
          title: r.is_translated ? (r.translated_title ?? r.title) : r.title,
          link: r.link, source: r.source,
          pubDate: r.pub_date ?? r.cached_at,
          description: r.description ?? '',
        }));
        if (!isFresh) {
          fetch(new URL('/api/news/prefetch', req.url).toString()).catch(() => {});
          return Response.json({ items, fetchedAt: latestCachedAt, total: items.length, cached: true, refreshing: true });
        }
        return Response.json({ items, fetchedAt: latestCachedAt, total: items.length, cached: true });
      }
    } catch { /* cache miss */ }
  }

  const selectedFeeds = category ? FEEDS.filter(f => f.category === category) : FEEDS;
  const results = await Promise.allSettled(selectedFeeds.map(feed => fetchFeed(feed)));

  let items: NewsItem[] = results
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);

  items = deduplicate(items);
  items.sort((a, b) => (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0));
  items = items.slice(0, limit);

  // Translate: try LLM first, then MyMemory fallback
  await translateViaLLM(items);
  await translateFallbackMyMemory(items);

  return Response.json({ items, fetchedAt: new Date().toISOString(), total: items.length });
}
