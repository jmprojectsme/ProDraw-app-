const CACHE_NAME    = 'prodraw-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap'
];

// ── Install: cache all assets ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('ProDraw SW: caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ─────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('ProDraw SW: removing old cache', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fallback to network ───────
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            // Cache valid responses dynamically
            if (!response || response.status !== 200 || response.type === 'opaque') {
              return response;
            }
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return response;
          })
          .catch(() => {
            // Offline fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

