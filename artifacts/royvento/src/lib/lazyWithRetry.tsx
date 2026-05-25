import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Drop-in replacement for React.lazy that hardens dynamic imports against the
 * two failure modes that show up as a blank white screen in production:
 *
 *   1. A transient network blip while fetching a route chunk — retried once
 *      after a short delay.
 *   2. A stale chunk after a new deploy: the running tab references the old
 *      hashed filenames, which 404 once the new build is live. We trigger a
 *      single full reload so the browser pulls the fresh asset manifest. A
 *      sessionStorage guard prevents reload loops if the import keeps failing
 *      for a genuine reason (in which case the ErrorBoundary takes over).
 */
const RELOAD_GUARD_KEY = "royvento_chunk_reloaded";

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
      return mod;
    } catch {
      // One retry for a transient failure.
      try {
        await new Promise((r) => setTimeout(r, 400));
        const mod = await factory();
        sessionStorage.removeItem(RELOAD_GUARD_KEY);
        return mod;
      } catch (err) {
        // Likely a stale chunk after a deploy — reload once to get the new
        // manifest. Guard against an infinite reload loop.
        if (typeof window !== "undefined" && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
          window.location.reload();
          // Never resolve — the reload replaces this document.
          return new Promise<{ default: T }>(() => {});
        }
        throw err;
      }
    }
  });
}
