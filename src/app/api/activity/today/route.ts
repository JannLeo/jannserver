import { NextResponse } from 'next/server';
import https from 'https';
import { readFileSync } from 'fs';
import { homedir } from 'os';

function getGitHubToken(): string | null {
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (envToken) return envToken;
  try {
    const creds = readFileSync(`${homedir()}/.git-credentials`, 'utf8');
    const match = creds.match(/https:\/\/([^:]+):([^@]+)@github\.com/);
    if (match) return match[2];
  } catch { /* ignore */ }
  return null;
}

function getGitHubUser(): string {
  return process.env.GITHUB_USER || 'JannLeo';
}

function fetchJSON(url: string, token: string | null, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'JannWorkspace/1.0',
      'Accept': 'application/vnd.github+json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = https.request(url, { timeout: timeoutMs, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Bad JSON: ${data.slice(0, 200)}`)); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

export async function GET() {
  const today = new Date().toISOString().split('T')[0];
  const token = getGitHubToken();
  const user = getGitHubUser();

  try {
    // Search for today's commits (bypass proxy — direct HTTPS)
    const data: any = await fetchJSON(
      `https://api.github.com/search/commits?q=author:${user}+committer-date:${today}&per_page=100`,
      token
    );
    const commits: any[] = data.items || [];
    const repoSet = new Set<string>();
    commits.forEach((c: any) => {
      if (c.repository?.full_name) repoSet.add(c.repository.full_name);
    });

    if (repoSet.size === 0) {
      const reposData: any[] = await fetchJSON(
        `https://api.github.com/users/${user}/repos?per_page=30&sort=pushed&direction=desc`,
        token
      );
      const recentRepos = (reposData || []).slice(0, 10).map((r: any) => r.full_name);
      return NextResponse.json({
        ok: true, totalCommits: 0,
        repos: recentRepos,
        note: '今日无提交，展示最近活跃仓库',
      });
    }

    return NextResponse.json({ ok: true, totalCommits: commits.length, repos: Array.from(repoSet) });
  } catch {
    return NextResponse.json({ ok: true, repos: [], totalCommits: 0 });
  }
}