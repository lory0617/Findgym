// Findgym service worker — installable + offline-capable.
//
// The app shell (HTML / JS / CSS / manifest) and gym data are network-first so
// code and data updates always reach online users; the cache is the offline
// fallback. Large vendored map assets (Leaflet, marker images) are cache-first
// since they're versioned and rarely change. Bump CACHE on any change to this
// strategy to purge stale entries on activate.
const CACHE = "findgym-v3";
const CORE = [
  "./",
  "./index.html",
  "./src/app.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/vendor/leaflet/leaflet.js",
  "./assets/vendor/leaflet/leaflet.css",
  "./assets/vendor/leaflet/images/marker-icon.png",
  "./assets/vendor/leaflet/images/marker-icon-2x.png",
  "./assets/vendor/leaflet/images/marker-shadow.png",
  "./data/gyms.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Cross-origin (OpenStreetMap tiles) — always go to the network, never cache.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Vendored map library + images: cache-first (versioned, rarely change).
  if (url.pathname.includes("/assets/vendor/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else same-origin — app shell (HTML/JS/CSS) and gym data:
  // network-first so updates always show online, cache is the offline fallback.
  event.respondWith(networkFirst(request));
});

function cacheFirst(request) {
  return caches.match(request, { ignoreSearch: true }).then(
    (hit) =>
      hit ||
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
  );
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request, { ignoreSearch: true }));
}
