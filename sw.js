const CACHE_NAME = 'pureread-hk-v4';
const APP_SHELL = ['./', './index.html', './manifest.json', './assets/icon.jpeg'];
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
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
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
      if (file instanceof File) await saveSharedFile(file);
      return Response.redirect(new URL('./index.html?shared_file=1', event.request.url), 303);
    })());
    return;
  }
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
