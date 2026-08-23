const CACHE_NAME = 'nomad-v2.2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './features.html',
  './visualizer.html',
  './geek-stats.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
];

// Install Event: Pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Purge older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Network-first for dynamic tile/weather/geocode APIs, Stale-While-Revalidate for app core
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass caching for dynamic APIs (Nominatim, Open-Meteo, Vector Tiles)
  if (
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('api.open-meteo.com') ||
    url.hostname.includes('cartocdn.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Stale-While-Revalidate for local assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
