/**
 * sw.js — Service Worker for Jann's Workspace PWA
 * Strategy:
 *   - Static assets (JS/CSS/images): Cache-first
 *   - API routes (dynamic): Network-first with cache fallback
 *   - Navigation: Network-first (ensures fresh pages)
 */
const CACHE_NAME = 'workspace-v1';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/tasks',
  '/notes',
  '/memos',
  '/ask',
  '/wiki',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// ─── Install: pre-cache app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignore pre-cache failures — some pages may need auth
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s)
  if (!url.protocol.startsWith('http')) return;

  // API routes: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Navigation (HTML pages): network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico|webp)$/) ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(request));
});

// ─── Strategies ─────────────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    // Try cache for offline page
    const cached = await caches.match(request);
    if (cached) return cached;
    // Try dashboard cache as offline landing
    const dash = await caches.match('/dashboard');
    if (dash) return dash;
    return new Response('Offline — 請檢查網路連線', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}