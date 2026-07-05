/**
 * Proxy-aware request routing.
 *
 * Provides a per-request proxy agent for HTTPS requests using https-proxy-agent.
 * Does NOT use global-agent (which is a global singleton that breaks other routes).
 * Does NOT use undici (which fails with 'File is not defined' in webpack bundle).
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import type { IncomingMessage } from 'http';
import type { ClientRequest } from 'http';

const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890';

// Singleton agent
let agent: HttpsProxyAgent<string> | null = null;

function getAgent(): HttpsProxyAgent<string> {
  if (!agent) {
    agent = new HttpsProxyAgent(PROXY_URL);
  }
  return agent;
}

/**
 * Make an HTTPS GET request through the proxy.
 * Returns the parsed JSON body.
 */
export async function proxyFetch(url: string): Promise<unknown> {
  const { request } = await import('https');
  return new Promise((resolve, reject) => {
    const req: ClientRequest = request(url, {
      agent: getAgent(),
      timeout: 15000,
      headers: { 'Accept': 'application/json' },
    }, (res: IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Bad response: ${res.statusCode} ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (e: Error) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

/**
 * Make an HTTP(S) GET request through the proxy, returning raw text.
 * Useful for RSS feeds, HTML, etc.
 */
export async function proxyFetchText(url: string, timeoutMs = 10000): Promise<string> {
  const mod = url.startsWith('https') ? await import('https') : await import('http');
  const { request } = mod;
  return new Promise((resolve, reject) => {
    const req: ClientRequest = request(url, {
      agent: getAgent(),
      timeout: timeoutMs,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JannWorkspace/1.0)' },
    }, (res: IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (e: Error) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}