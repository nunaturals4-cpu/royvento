import { createRoot } from "react-dom/client";
import App from "./App";
import { ServiceWorkerUpdatePrompt } from "./sw-update-prompt";
import "./index.css";
import "./i18n/index";

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
