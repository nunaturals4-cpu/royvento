// ── Cache names — bump the version suffix to force eviction on deploy ──────
const STATIC_CACHE = "royvento-assets-v7";
const API_CACHE    = "royvento-api-v7";

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
  // Up to 2 action buttons (the practical desktop-browser limit): a one-tap
  // Call when the notification carries a phone, and a View Booking action
  // when it carries a specific deep link (both fire from notificationclick).
  const actions = [];
  if (payload.phone) actions.push({ action: "call", title: "📞 Call" });
  if (payload.url) actions.push({ action: "view", title: "View Booking" });
  const options = {
    body: payload.body ?? "",
    icon: "/pwa-192x192.png",
    badge: "/favicon-48x48.png",
    data: { url: payload.url ?? "/", phone: payload.phone ?? null, ...(payload.data ?? {}) },
    tag: payload.tag ?? "royvento-push",
    ...(actions.length ? { actions } : {}),
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

  // One-tap "Call" action — dial the customer directly instead of navigating.
  if (event.action === "call") {
    const phone = event.notification.data?.phone;
    if (phone) event.waitUntil(clients.openWindow("tel:" + phone));
    return;
  }

  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Reuse an open tab when we have one: navigate it to the deep-link target
      // (e.g. the followed venue's page) and focus it, so the click always lands
      // on the right page instead of wherever the tab happened to be.
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          const focused = "focus" in client ? client.focus() : Promise.resolve(client);
          if ("navigate" in client && url) {
            return Promise.resolve(focused).then(() => client.navigate(url).catch(() => client));
          }
          return focused;
        }
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
