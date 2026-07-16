// PureRead HK service worker
// 目的：讓網站符合「可安裝」條件，並確保離線時仍可開啟主頁。

const CACHE_NAME = 'pure-reader-hk-v20260713-fixed';
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

  // 只處理 GET
  if (req.method !== 'GET') return;

  // 導覽請求：離線時回退到 index.html
  // 特別處理帶有分享參數的 URL，忽略 search params 進行匹配
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          // 關鍵：使用 ignoreSearch 確保帶參數的分享 URL 也能匹配到緩存的 index.html
          const cached = await cache.match('./index.html', { ignoreSearch: true });
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 其他資源：cache-first，再回到 network
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
