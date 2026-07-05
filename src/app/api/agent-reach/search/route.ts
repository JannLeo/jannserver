// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { isUtf8 } from 'buffer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: 30000 });
    let out = '';
    let err = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve(out);
      else reject(new Error(err || `exit ${code}`));
    });
  });
}

async function ghSearch(query: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5&sort=stars&order=desc`,
      { headers: { 'User-Agent': 'workspace-app/1.0' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).slice(0, 5).map((r: any) => ({
      platform: 'github',
      title: r.full_name,
      url: r.html_url,
      description: r.description || '',
      stars: r.stargazers_count,
      language: r.language || '',
      updated: r.updated_at,
    }));
  } catch { return []; }
}

async function youtubeSearch(query: string): Promise<any[]> {
  try {
    // yt-dlp doesn't have a search command, but we can look up via search queries
    // Use a public search API approach
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; workspace-app/1.0)' } }
    );
    if (!res.ok) return [];
    const html = await res.text();
    // Extract video IDs from initial player data
    const matches = [...html.matchAll(/"videoId":"([^"]+)"/g)].slice(0, 5);
    const ids = matches.map(m => m[1]);
    return ids.map(id => ({
      platform: 'youtube',
      title: `YouTube Video: ${id}`,
      url: `https://www.youtube.com/watch?v=${id}`,
      videoId: id,
    }));
  } catch { return []; }
}

async function bilibiliSearch(query: string): Promise<any[]> {
  try {
    const mcUrl = (process.env.MEDIA_CRAWLER_BASE_URL || '').trim();
    if (!mcUrl) return [];
    // Try bilibili search via MediaCrawler
    const res = await fetch(`${mcUrl}/api/search/bilibili?keyword=${encodeURIComponent(query)}&limit=5`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 5).map((r: any) => ({
      platform: 'bilibili',
      title: r.title || r.author || 'B站视频',
      url: r.url || r.share_url || '',
      author: r.author || '',
      views: r.view || '',
    }));
  } catch { return []; }
}

async function webSearch(query: string): Promise<any[]> {
  // Use Jina AI Reader for web search
  try {
    const res = await fetch(
      `https://s.jina.ai/${encodeURIComponent(query)}`,
      { headers: { 'Accept': 'application/json', 'X-Respond-With': 'no-content' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 5).map((r: any) => ({
      platform: 'web',
      title: r.title || '',
      url: r.url || '',
      description: r.contentSnippet || r.description || '',
    }));
  } catch { return []; }
}

async function ghCodeSearch(query: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=5`,
      { headers: { 'User-Agent': 'workspace-app/1.0' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).slice(0, 5).map((r: any) => ({
      platform: 'github-code',
      title: r.name,
      url: r.html_url,
      repo: r.repository?.full_name || '',
      description: `在 ${r.repository?.full_name} 中`,
      path: r.path,
    }));
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const platform = searchParams.get('platform') || 'all';

  if (!q.trim()) {
    return NextResponse.json({ results: [], query: q });
  }

  const start = Date.now();
  let results: any[] = [];

  try {
    const queries = platform === 'all'
      ? [
          { p: 'github', fn: () => ghSearch(q) },
          { p: 'youtube', fn: () => youtubeSearch(q) },
          { p: 'web', fn: () => webSearch(q) },
        ]
      : [{ p: platform, fn: null }];

    const searchFns: Record<string, () => Promise<any[]>> = {
      github: () => ghSearch(q),
      youtube: () => youtubeSearch(q),
      bilibili: () => bilibiliSearch(q),
      web: () => webSearch(q),
      'github-code': () => ghCodeSearch(q),
    };

    const fn = searchFns[platform];
    if (!fn && platform !== 'all') {
      return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
    }

    if (platform === 'all') {
      // 并行搜索
      const allResults = await Promise.allSettled(
        ['github', 'youtube', 'web'].map(p => searchFns[p]())
      );
      const labels = ['github', 'youtube', 'web'];
      allResults.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          results = results.concat(r.value.map(item => ({ ...item, _searchLabel: labels[i] })));
        }
      });
    } else {
      results = await fn();
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
  }

  return NextResponse.json({
    results,
    query: q,
    platform,
    count: results.length,
    time: Date.now() - start,
  });
}