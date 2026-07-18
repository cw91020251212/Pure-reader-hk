// PureRead HK service worker
const CACHE_NAME = 'pure-reader-hk-v20260718-pivot';
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './favicon.ico',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/favicon-32.png',
  './assets/favicon-16.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 雙重保險：攔截分享請求，採用明確參數 ?share=1
  if (req.method === 'POST' && req.url.includes('share=1')) {
    event.respondWith((async () => {
      try {
        const formData = await req.formData();
        const file = formData.get('shared_file');
        const text = formData.get('text') || formData.get('url');

        if (file) {
          const fileContent = await file.text();
          const cache = await caches.open('shared-content-cache');
          await cache.put('/shared-file-temp', new Response(fileContent));
          return Response.redirect('./index.html?shared_file=true', 303);
        }

        if (text) {
          return Response.redirect('./index.html?url=' + encodeURIComponent(text), 303);
        }

        return Response.redirect('./index.html', 303);
      } catch (error) {
        console.error('[Service Worker] 分享處理失敗:', error);
        return Response.redirect('./index.html?error=share_failed', 303);
      }
    })());
    return;
  }

  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match('./index.html', { ignoreSearch: true });
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        return Response.error();
      }
    })()
  );
});
