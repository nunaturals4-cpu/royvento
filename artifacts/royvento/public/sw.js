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
