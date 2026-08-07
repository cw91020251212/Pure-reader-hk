const CACHE_NAME = 'pureread-hk-v6-original-images';
const APP_SHELL = [
  './', './index.html', './manifest.json', './favicon.ico',
  './assets/icon.jpeg', './assets/icon-192.png', './assets/icon-512.png',
  './assets/icon-maskable-512.png', './assets/apple-touch-icon.png'
];
const DB_NAME = 'pureread-hk-share';
const STORE_NAME = 'files';

function openShareDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSharedFile(file) {
  const db = await openShareDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      id: 'latest',
      name: file.name || 'shared.html',
      type: file.type || 'text/html',
      blob: file
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

self.addEventListener('install', event => {
  /* 【修正】原本用 cache.addAll()，它係原子操作：APP_SHELL 中任何一個檔 404，
   * 整個 install 就會 reject，Service Worker 完全裝唔上（實測 caches 得個空殼 []，
   * 離線功能全失效）。改為逐個 cache.add() 並容忍個別失敗，
   * 咁樣就算某個圖示唔見都唔會拖垮整個 App。 */
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async url => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[SW] 略過無法快取的資源:', url, err);
      }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'read-latest-shared-file') return;
  event.waitUntil((async () => {
    const db = await openShareDatabase();
    const file = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get('latest');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!file) return;
    event.source?.postMessage({ type: 'shared-file-ready', file: file.blob, name: file.name, mime: file.type });
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method === 'POST' && new URL(event.request.url).pathname.endsWith('/index.html')) {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      let file = formData.get('file');
      if (!(file instanceof File)) {
        for (const value of formData.values()) {
          if (value instanceof File) {
            file = value;
            break;
          }
        }
      }
      if (file instanceof File) {
        await saveSharedFile(file);
        return Response.redirect(new URL('./index.html?shared_file=1', event.request.url), 303);
      }

      const sharedUrl = typeof formData.get('url') === 'string' ? formData.get('url').trim() : '';
      const sharedText = typeof formData.get('text') === 'string' ? formData.get('text').trim() : '';
      const redirectUrl = new URL('./index.html', event.request.url);
      if (sharedUrl) redirectUrl.searchParams.set('url', sharedUrl);
      else if (sharedText) redirectUrl.searchParams.set('text', sharedText);
      return Response.redirect(redirectUrl, 303);
    })().catch(() => Response.redirect(new URL('./index.html', event.request.url), 303)));
    return;
  }
  if (event.request.method !== 'GET') return;

  /* 【修正】原本離線時只做 caches.match(event.request)，但頁面導航的 request
   * 帶 query string（例如 ?shared_file=1 、?url=…），同快取入面的 './index.html'
   * 對唔上，結果離線開 App 會白畫面。現在導航失敗時明確回退到 index.html。 */
  event.respondWith((async () => {
    try {
      const fresh = await fetch(event.request);
      // 順手把成功取得的 app shell 更新入快取（stale-while-revalidate）
      if (fresh && fresh.ok && new URL(event.request.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      if (event.request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
