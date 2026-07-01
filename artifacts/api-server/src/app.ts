import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import sitemapRouter from "./routes/sitemap";
import legacyRedirectsRouter from "./routes/legacyRedirects";
import { makeHtmlSeoRouter } from "./routes/htmlSeo";
import { logger } from "./lib/logger";
import { SESSION_SECRET } from "./lib/auth";
import path from "path";
import { existsSync } from "fs";

if (
  process.env["NODE_ENV"] === "production" &&
  process.env["PAYMENT_BYPASS"] === "true"
) {
  throw new Error(
    "PAYMENT_BYPASS=true is not allowed in production. Remove the variable before starting the server.",
  );
}

// ─── CORS allow-list ──────────────────────────────────────────────────────────
//
// We explicitly allow the production hosts, the project's Replit dev domain(s),
// and the Expo dev domain. Same-origin / non-browser requests (no Origin
// header — e.g. native mobile, server-to-server, curl) are also allowed so
// that mobile clients sending Bearer tokens keep working. Other origins are
// rejected to avoid CSRF/credential leak via `credentials: include`.

function buildAllowedOrigins(): Set<string> {
  const allowed = new Set<string>([
    "https://royvento.com",
    "https://www.royvento.com",
  ]);
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    for (const d of replitDomains.split(",")) {
      const trimmed = d.trim();
      if (trimmed) allowed.add(`https://${trimmed}`);
    }
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) allowed.add(`https://${dev}`);
  const expo = process.env["REPLIT_EXPO_DEV_DOMAIN"];
  if (expo) allowed.add(`https://${expo}`);
  // Support additional origins for Railway / other deployments (comma-separated)
  const extra = process.env["CORS_ORIGINS"];
  if (extra) {
    for (const o of extra.split(",")) {
      const trimmed = o.trim();
      if (trimmed) allowed.add(trimmed);
    }
  }
  // Auto-allow the Railway public domain so same-server frontend requests work
  const railwayDomain = process.env["RAILWAY_PUBLIC_DOMAIN"];
  if (railwayDomain) allowed.add(`https://${railwayDomain}`);
  return allowed;
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
};

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);

// ─── Canonical host redirect (SEO C3) ─────────────────────────────────────────
//
// Force a single canonical origin in production: apex host, https, no `www.`.
// Prevents www/apex + http/https duplicate-URL signals from splitting ranking
// authority and stops crawlers indexing non-canonical variants. Only runs in
// production and only when the host/proto is actually non-canonical, so it is a
// no-op for correctly-addressed requests (and never touches local dev).
app.use((req, res, next) => {
  if (process.env["NODE_ENV"] !== "production") return next();
  const host = (req.get("host") ?? "").toLowerCase();
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  const isRoyvento = host === "royvento.com" || host === "www.royvento.com";
  if (isRoyvento && (host.startsWith("www.") || proto !== "https")) {
    return res.redirect(301, `https://royvento.com${req.originalUrl}`);
  }
  return next();
});

// ─── Response compression ──────────────────────────────────────────────────────
//
// gzip/brotli every compressible response (JSON API payloads, HTML, JS/CSS the
// static mount serves). Typically shrinks text payloads ~70-80%, so the same
// egress bandwidth serves several times more users and pages load faster on
// slow connections. `compression` already skips already-compressed types
// (images, video) and small bodies below `threshold`, and honours a
// `x-no-compression` request header, so there is no behavioural/UI change —
// clients receive identical bytes, just Content-Encoding'd. Registered early so
// it wraps every downstream handler.
app.use(
  compression({
    // Don't spend CPU compressing tiny bodies where framing overhead dominates.
    threshold: 1024,
  }),
);

// ─── Security response headers ────────────────────────────────────────────────
//
// Dependency-free hardening applied to every response. Deliberately omits CSP /
// COEP / CORP / COOP so cross-origin images, fonts, Google-OAuth popups and the
// SPA's inline styles keep working unchanged — these headers only add defense
// against MIME-sniffing, clickjacking and referrer leakage, and enforce HTTPS
// in production. No behavioural / UI impact.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (process.env["NODE_ENV"] === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    );
  }
  next();
});

app.use(cors(corsOptions));
app.use(
  express.json({
    limit: "50mb",
    // Stash the raw request body for webhook signature verification.
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser(SESSION_SECRET));

// ─── Global API rate limiter ─────────────────────────────────────────────────
//
// 120 req/min/IP by default. Per-route tighter limiters live in their routers
// (auth login/register/forgot, contact, storage uploads).

const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again shortly." },
});

app.use("/api", globalApiLimiter, router);

// Sitemap shards live at the site root (e.g. /sitemap-index.xml) so search
// engines can discover them at the conventional location. The shared proxy
// only forwards these paths to api-server because they are listed in
// .replit-artifact/artifact.toml's services.paths.
app.use(sitemapRouter);

// HTTP 301 redirects for legacy vendor/partner URLs to the canonical
// /pubs/{city}/{slug}-{id} URL. The shared proxy forwards /vendors/* and
// /partners/* to api-server because they're listed in artifact.toml's
// services.paths. /events/{id} is handled SPA-side because the SPA also
// owns /events/{city}/{slug} which would conflict with a /events prefix
// claim here.
app.use(legacyRedirectsRouter);

// Serve the built frontend in production (same origin = no CORS needed).
// We try several candidate locations because the cwd at boot depends on how
// the service is started (e.g. `pnpm --filter @workspace/api-server start`
// sets cwd to the package dir, while a direct `node dist/index.mjs` from
// the repo root keeps cwd at the repo root). Picking the first one that
// exists makes the static mount robust to start-command changes — a recent
// railway.json edit broke prod for ~10 min by silently moving cwd.
const frontendCandidates = [
  path.resolve(process.cwd(), "artifacts/royvento/dist/public"),
  path.resolve(process.cwd(), "../royvento/dist/public"),
  path.resolve(process.cwd(), "../../artifacts/royvento/dist/public"),
  "/app/artifacts/royvento/dist/public",
];
const frontendDist = frontendCandidates.find((p) => existsSync(p));
if (frontendDist) {
  logger.info({ frontendDist }, "Serving frontend dist");
  app.use(
    express.static(frontendDist, {
      // Let "/" fall through to the SEO enrichment router / SPA catch-all
      // instead of auto-serving the raw index.html, so bots get enriched HTML.
      index: false,
      setHeaders(res, filePath) {
        // Vite emits content-hashed filenames under /assets, so those bytes
        // never change for a given URL — cache them for a year, immutably,
        // so repeat visits skip the network entirely. index.html must stay
        // revalidated so a new deploy is picked up on the next load.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
} else {
  logger.warn({ tried: frontendCandidates }, "No frontend dist found — only API routes will respond");
}

// JSON 404 for unmatched /api/* routes — must come BEFORE the SPA catch-all
// so unknown API paths always return JSON, never index.html. Applies in every
// environment: production (where the SPA catch-all would otherwise serve HTML)
// and local dev (where Express's default 404 is text/html).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Dynamic rendering for crawlers (SEO C1/C2) ───────────────────────────────
//
// Enriches the served HTML (per-route <title>, meta, canonical, OG/Twitter,
// JSON-LD and a crawlable text body) for search engines, AI answer-engine
// crawlers and social scrapers on public content routes. Human visitors and any
// unmatched route fall through untouched to the SPA catch-all below, so the
// interactive experience is byte-for-byte unchanged. Mounted AFTER the static
// mount (real files win) and BEFORE the catch-all.
if (frontendDist) {
  app.use(makeHtmlSeoRouter(path.join(frontendDist, "index.html")));
}

// SPA catch-all: serve index.html for all non-API GET requests so client-side
// routing (wouter) works on direct navigation / page refresh.
if (frontendDist) {
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ─── Terminal error handler ───────────────────────────────────────────────────
//
// Catches CORS rejections and any error propagated via next(err). Returns a
// generic, body-only message so internal details / stack traces are never
// leaked to clients (Express's default handler echoes the message + stack in
// non-production). Behaviour for normal requests is unchanged — this only runs
// on errors that previously fell through to Express's default 500.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && err.message && err.message.includes("is not allowed by CORS")) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
