// GuruStock Service Worker
// Cache-first for static assets, network-first for API calls.
const CACHE_NAME = "gurustock-v1";
const STATIC_PATTERNS = [
  /\.(js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/,
  /^\/manifest\.json$/,
  /^\/$/,
  /^\/favicon/,
];

function isStatic(url) {
  const { pathname } = new URL(url);
  return STATIC_PATTERNS.some((p) => p.test(pathname));
}

function isApi(url) {
  return new URL(url).pathname.startsWith("/api/");
}

// Install — pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(["/", "/manifest.json"]);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch — strategy based on request type
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // API: network first, no caching
  if (isApi(request.url)) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: "offline", offline: true }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // Static assets: cache first, fallback to network
  if (isStatic(request.url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Navigation requests: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match("/");
        });
      })
  );
});
