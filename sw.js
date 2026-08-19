// NOMAD: RoadTrip - 4-Tier Service Worker Engine
const CACHE_VERSION = 'nomad-v1.0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;

// Tier 1: Core App Shell Assets
const APP_SHELL = [
  './',
  './index.html',
  './features.html',
  './gps-setup.html',
  './disco.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Tier 2: Core MapLibre CDN Assets (Immutable)
const CDN_ASSETS = [
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
];

// Install: Pre-cache App Shell & CDN
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)),
      caches.open(CDN_CACHE).then((cache) => cache.addAll(CDN_ASSETS))
    ])
  );
  self.skipWaiting();
});

// Activate: Auto-purge obsolete versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!key.startsWith(CACHE_VERSION)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Engine: 4-Tier Routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // -------------------------------------------------------------
  // TIER 4: Live Telemetry APIs -> Network-Only (Bypass cache)
  // -------------------------------------------------------------
  if (
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('open-meteo.com')
  ) {
    return; // Standard network fetch, zero cache
  }

  // -------------------------------------------------------------
  // TIER 2: Third-Party CDN -> Cache-First (Immutable)
  // -------------------------------------------------------------
  if (url.hostname.includes('unpkg.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return (
          cached ||
          fetch(event.request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(CDN_CACHE).then((c) => c.put(event.request, clone));
            }
            return response;
          })
        );
      })
    );
    return;
  }

  // -------------------------------------------------------------
  // TIER 3: Basemap Tiles & Glyphs -> Stale-While-Revalidate
  // -------------------------------------------------------------
  if (
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.pathname.endsWith('.pbf') ||
    url.pathname.includes('/fonts/')
  ) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((res) => {
              if (res.status === 200) {
                cache.put(event.request, res.clone());
              }
              return res;
            })
            .catch(() => cached);

          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // -------------------------------------------------------------
  // TIER 1: Local App Shell -> Stale-While-Revalidate
  // -------------------------------------------------------------
  event.respondWith(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cached || caches.match('./index.html'));

        return cached || fetchPromise;
      });
    })
  );
});