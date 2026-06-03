import { createRoot } from "react-dom/client";
import App from "./App";
import { ServiceWorkerUpdatePrompt } from "./sw-update-prompt";
import "./index.css";
import "./i18n/index";

// ── Global scroll-reveal ──────────────────────────────────────────────
// Any element with the `.reveal` class fades/slides in when it scrolls into
// view. Content is visible by default; we only opt into the hidden→shown
// behaviour once we know JS + IntersectionObserver are available (so SEO and
// no-JS users always see content). A rAF-debounced MutationObserver re-scans
// after SPA route changes / async data loads. Purely additive — no markup or
// behaviour depends on it.
if (typeof window !== "undefined" && "IntersectionObserver" in window) {
  document.documentElement.classList.add("js-reveal");

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
  );

  let scanQueued = false;
  const scan = () => {
    scanQueued = false;
    document
      .querySelectorAll<HTMLElement>(".reveal:not(.is-visible)")
      .forEach((el) => io.observe(el));
  };
  const queueScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  };

  const start = () => {
    queueScan();
    new MutationObserver(queueScan).observe(document.body, {
      childList: true,
      subtree: true,
    });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}

// Registration + "new version available" prompt now live inside
// <ServiceWorkerUpdatePrompt /> so the component can react to the SW lifecycle
// and surface the refresh banner. The SW (public/sw.js) no longer auto-claims
// clients, so a new build will not reload the page mid-session.

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <ServiceWorkerUpdatePrompt />
  </>,
);
