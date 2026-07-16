/**
 * Direct HTTP(S) request utility.
 *
 * Does NOT use global-agent (global singleton that breaks other routes).
 * Does NOT use undici (fails with 'File is not defined' in webpack).
 */

import type { IncomingMessage } from 'http';
import type { ClientRequest } from 'http';

/**
 * Make an HTTPS GET request through the proxy.
 * Returns the parsed JSON body.
 */
export async function proxyFetch(url: string): Promise<unknown> {
  const { request } = await import('https');
  return new Promise((resolve, reject) => {
    const req: ClientRequest = request(url, {
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