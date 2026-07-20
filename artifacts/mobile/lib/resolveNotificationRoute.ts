// Maps a notification's web `url` (or legacy `screen` hint) to the matching
// mobile route. Shared by the OS-level push-tap handler (app/_layout.tsx) and
// the in-app notifications list (app/notifications.tsx) so both entry points
// deep-link identically.
export function resolveNotificationRoute(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  // Legacy screen hint still supported.
  if (data.screen === "bookings") return "/(tabs)/bookings";

  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (!url || !url.startsWith("/")) return null;

  // Venue page: /pubs/<city>/<slug>-<id>[?tab=…]  →  /partner/<id>
  const pubMatch = /^\/pubs\/[^/]+\/.+-(\d+)(?:[/?#].*)?$/.exec(url);
  if (pubMatch) return `/partner/${pubMatch[1]}`;

  // Pub event page: /events/<city>/<slug>-<id>[?to=…]  →  /event/<id>
  const eventMatch = /^\/events\/[^/]+\/.+-(\d+)(?:[/?#].*)?$/.exec(url);
  if (eventMatch) return `/event/${eventMatch[1]}`;

  // Dashboard bookings → the bookings tab.
  if (url.startsWith("/dashboard/bookings")) return "/(tabs)/bookings";

  // Partner booking notification: /dashboard/<role>?tab=…&bookingId=123 →
  // the matching partner dashboard's Bookings tab with the detail modal open.
  // Mobile always calls this tab "bookings", even though the web organizer
  // and game-organizer dashboards fold the same report into an "insights" tab.
  const dashboardMatch = /^\/dashboard\/(vendor|organizer|game-organizer)(?:\?(.*))?$/.exec(url);
  if (dashboardMatch) {
    const qs = new URLSearchParams(dashboardMatch[2] ?? "");
    const bookingId = qs.get("bookingId");
    if (bookingId) return `/${dashboardMatch[1]}/dashboard?tab=bookings&bookingId=${encodeURIComponent(bookingId)}`;
  }

  // Paths whose mobile route matches the web path 1:1.
  const PASSTHROUGH = [
    "/organizer-events/",
    "/organizers/",
    "/game-organizers/",
    "/event/",
    "/events",
    "/partner/",
    "/pub-offers",
    "/tonight-plans",
    "/games-and-sports",
    "/solo-connect",
    "/blogs",
    "/blog/",
    "/notifications",
    "/subscription",
  ];
  if (PASSTHROUGH.some((p) => url === p || url.startsWith(p))) return url;

  return null;
}
