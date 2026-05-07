import { useEffect, useState } from "react";

/**
 * Service-worker update banner.
 *
 * The SW (public/sw.js) intentionally does NOT call skipWaiting() or
 * clients.claim() any more, because auto-activating a new build caused the
 * page to silently reload mid-session and could interrupt a booking. Instead,
 * we register the SW here, watch for an incoming `waiting` worker, and show a
 * non-intrusive banner. When the user clicks "Refresh", we post SKIP_WAITING
 * to the worker and reload the page exactly once on `controllerchange`.
 */
export function ServiceWorkerUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let reloading = false;

    const trackWaiting = (reg: ServiceWorkerRegistration) => {
      // Only surface the banner when there's already a controller — otherwise
      // this is the first-ever install and the new SW is sitting in `waiting`
      // simply because no client is being controlled yet, not because there's
      // an upgrade pending. Showing "New version available" before the user
      // has ever loaded the app is misleading.
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // A new SW finished installing while an old one is still controlling
          // the page → it goes into `waiting`. That's our cue to prompt.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(installing);
          }
        });
      });
    };

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        if (cancelled) return;
        trackWaiting(reg);
      })
      .catch(() => {
        // Registration failures are non-fatal; the app still works.
      });

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waitingWorker) return null;

  const apply = () => {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    // Page reload happens via `controllerchange` once the new SW activates.
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "rgba(20,20,28,0.95)",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 14,
        fontFamily: "Inter, system-ui, sans-serif",
        maxWidth: "90vw",
      }}
    >
      <span>New version available</span>
      <button
        type="button"
        onClick={apply}
        style={{
          background: "linear-gradient(135deg,#a855f7,#6366f1)",
          color: "#fff",
          border: "none",
          padding: "6px 12px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Refresh to update
      </button>
      <button
        type="button"
        onClick={() => setWaitingWorker(null)}
        aria-label="Dismiss update prompt"
        style={{
          background: "transparent",
          color: "rgba(255,255,255,0.6)",
          border: "none",
          padding: "4px 6px",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
