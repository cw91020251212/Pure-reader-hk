const SHARE_CACHE = 'pureread-share-target-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const sharedFile = pickSharedFile(formData);

    if (sharedFile) {
      const content = await sharedFile.text();
      const payload = {
        name: sharedFile.name || '分享檔案.html',
        type: sharedFile.type || guessType(sharedFile.name),
        content
      };

      const cache = await caches.open(SHARE_CACHE);
      const sharedFileUrl = new URL('./shared-file.json', self.registration.scope).toString();
      await cache.put(sharedFileUrl, new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));

      return Response.redirect(new URL('./index.html?shared-file=1', self.registration.scope).toString(), 303);
    }

    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';
    const detectedUrl = String(url || text).match(/(https?|hdml|file|content):\/\/[^\s]+/i);

    if (detectedUrl) {
      return Response.redirect(new URL(`./index.html?url=${encodeURIComponent(detectedUrl[0])}`, self.registration.scope).toString(), 303);
    }

    const content = [title, text].filter(Boolean).join('\n\n');
    if (content) {
      const cache = await caches.open(SHARE_CACHE);
      const sharedFileUrl = new URL('./shared-file.json', self.registration.scope).toString();
      await cache.put(sharedFileUrl, new Response(JSON.stringify({
        name: '分享文字.txt',
        type: 'text/plain',
        content
      }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
      return Response.redirect(new URL('./index.html?shared-file=1', self.registration.scope).toString(), 303);
    }
  } catch (error) {
    console.error('[PureRead HK] share target failed:', error);
  }

  return Response.redirect(new URL('./index.html', self.registration.scope).toString(), 303);
}

function pickSharedFile(formData) {
  const direct = formData.get('file') || formData.get('files');
  if (isFileLike(direct)) return direct;
  for (const value of formData.values()) {
    if (isFileLike(value)) return value;
  }
  return null;
}

function isFileLike(value) {
  return value && typeof value === 'object' && typeof value.text === 'function' && typeof value.name === 'string' && value.size > 0;
}

function guessType(name = '') {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith('.md')) return 'text/markdown';
  if (lowerName.endsWith('.txt')) return 'text/plain';
  return 'text/html';
}
