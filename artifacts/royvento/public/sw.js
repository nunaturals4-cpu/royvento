// ── Cache names — bump the version suffix to force eviction on deploy ──────
const STATIC_CACHE = "royvento-assets-v5";
const API_CACHE    = "royvento-api-v5";

// Public read-only API paths that are safe to serve stale while revalidating.
const CACHEABLE_API_PREFIXES = [
  "/api/events/featured",
  "/api/events/popular",
  "/api/announcements/recent",
  "/api/announcements/slider",
];

// Activate: clean up any old cache names we no longer use.
self.addEventListener("activate", (event) => {
  const valid = new Set([STATIC_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !valid.has(k)).map((k) => caches.delete(k)))
    )
  );
});

// Fetch: cache-first for hashed Vite assets; stale-while-revalidate for
// public API calls; everything else goes straight to the network.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Vite content-hashed bundles (/assets/*.js, /assets/*.css) — cache-first.
  // A new build gets new filenames so stale entries are never re-requested.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  // Public API endpoints — stale-while-revalidate: serve cached data
  // immediately, then update the cache in the background.
  if (CACHEABLE_API_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fresh = fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
          return cached ?? fresh;
        })
      )
    );
    return;
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: "Royvento", body: event.data.text() }; }
  const title = payload.title ?? "Royvento";
  const options = {
    body: payload.body ?? "",
    icon: "/pwa-192x192.png",
    badge: "/favicon-48x48.png",
    data: { url: payload.url ?? "/", ...(payload.data ?? {}) },
    tag: payload.tag ?? "royvento-push",
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) => {
          for (const client of list) {
            client.postMessage({ type: "royvento-notification", payload });
          }
        }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Intentionally NOT calling skipWaiting() / clients.claim() here.
// Auto-activating a new SW caused mid-session page reloads (users mid-booking
// would lose their state). Instead, the new SW sits in `waiting` state until
// the user explicitly clicks "Refresh to update" in the app's update banner,
// which posts a SKIP_WAITING message to this worker (handled below).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
