import { readFileSync, statSync } from "node:fs";
import type { Request, Response } from "express";

/**
 * Server-side HTML enrichment ("dynamic rendering") utilities.
 *
 * Royvento's frontend is a client-side-rendered SPA, so the raw HTML the
 * server ships to non-JS clients (AI answer-engine crawlers such as
 * OAI-SearchBot / PerplexityBot / ClaudeBot, plus social scrapers) is an empty
 * shell with a generic <title>. These helpers let the API server inject the
 * per-route <title>, meta, canonical, Open Graph / Twitter tags, JSON-LD and a
 * crawlable text body into the served index.html — WITHOUT touching the SPA.
 *
 * Human visitors (a normal browser User-Agent) receive the untouched shell and
 * the exact same client-rendered experience as before. Only crawlers get the
 * enriched HTML, which mirrors what the SPA renders — this is Google-sanctioned
 * dynamic rendering, not cloaking.
 *
 * PRIVACY: only ever pass already-public content into `SeoData`. Never user
 * emails/phones, owner ids, balances, ticket salts, support contact details or
 * any authenticated data.
 */

const CANONICAL_HOST = "royvento.com";
const DEFAULT_OG_IMAGE = "https://royvento.com/opengraph.jpg";

// Crawlers / bots / social scrapers we want to serve pre-rendered HTML to.
// Matches search engines, AI answer engines and link-preview fetchers.
const BOT_RE =
  /bot|crawler|spider|slurp|gptbot|oai-searchbot|chatgpt-user|perplexity|claude|anthropic|google-extended|bingbot|applebot|amazonbot|meta-external|bytespider|ccbot|cohere|facebookexternalhit|facebot|slackbot|linkedinbot|twitterbot|discordbot|telegrambot|whatsapp|embedly|quora|pinterest|redditbot/i;

export function isCrawler(ua: string | undefined | null): boolean {
  return !!ua && BOT_RE.test(ua);
}

/**
 * Absolute origin for canonical / OG URLs. Mirrors the frontend SEO component:
 * production royvento.com hosts always resolve to the apex https origin so we
 * never emit a canonical that points at www / a preview host.
 */
export function canonicalOrigin(req: Request): string {
  const appUrl = process.env["APP_URL"];
  if (appUrl) return appUrl.replace(/\/$/, "");
  const host = (req.get("host") ?? "").toLowerCase();
  if (host === CANONICAL_HOST || host.endsWith(`.${CANONICAL_HOST}`)) {
    return `https://${CANONICAL_HOST}`;
  }
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  return host ? `${proto}://${host}` : `https://${CANONICAL_HOST}`;
}

// In-memory cache of index.html, invalidated by mtime so a new deploy is
// picked up automatically without a restart-only cache.
let shellCache: { path: string; html: string; mtime: number } | null = null;
export function loadShell(indexPath: string): string {
  const mtime = statSync(indexPath).mtimeMs;
  if (!shellCache || shellCache.path !== indexPath || shellCache.mtime !== mtime) {
    shellCache = { path: indexPath, html: readFileSync(indexPath, "utf8"), mtime };
  }
  return shellCache.html;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip HTML tags + collapse whitespace, then cap length. For meta text. */
export function toPlainText(input: string | null | undefined, max = 300): string {
  if (!input) return "";
  const text = String(input)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

export function absoluteUrl(origin: string, input?: string | null): string | undefined {
  if (!input) return undefined;
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith("/")) return `${origin}${input}`;
  return `${origin}/${input}`;
}

export type JsonLd = Record<string, unknown>;

export interface SeoData {
  title: string;
  description: string;
  canonical: string; // absolute
  ogImage?: string | undefined; // absolute preferred
  ogType?: string | undefined;
  noindex?: boolean | undefined;
  jsonLd?: JsonLd[] | undefined;
  /** Crawlable content injected off-screen for bots only (already-public). */
  bodyHtml?: string | undefined;
}

/** Build a crawlable, off-screen content block for bots (never shown to users). */
export function buildBodyBlock(bodyHtml: string): string {
  // Sits OUTSIDE #root, so React's createRoot(...).render() never touches it,
  // guaranteeing zero interference with hydration or UX. aria-hidden + off-screen
  // so assistive tech and humans ignore it; crawlers still read the markup.
  return `\n<div id="seo-prerender" aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);left:-9999px;top:-9999px">${bodyHtml}</div>`;
}

/**
 * Produce the enriched HTML string from the shell + SeoData.
 * When `includeBody` is false only the <head> is enriched.
 */
export function renderEnrichedHtml(shell: string, d: SeoData, includeBody: boolean): string {
  const robots = d.noindex
    ? "noindex, nofollow"
    : "index, follow, max-image-preview:large";
  const image = d.ogImage ?? DEFAULT_OG_IMAGE;

  const headTags = [
    `<title>${escapeHtml(d.title)}</title>`,
    `<meta name="description" content="${escapeHtml(d.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(d.canonical)}" />`,
    `<link rel="alternate" hreflang="en-IN" href="${escapeHtml(d.canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(d.canonical)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:site_name" content="Royvento" />`,
    `<meta property="og:title" content="${escapeHtml(d.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(d.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(d.canonical)}" />`,
    `<meta property="og:type" content="${escapeHtml(d.ogType ?? "website")}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(d.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(d.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    ...(d.jsonLd ?? []).map(
      (j) =>
        `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`,
    ),
  ].join("\n    ");

  // Strip the static shell's generic head tags so bots never see duplicates.
  let out = shell
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "");

  out = out.replace(/<\/head>/i, `    ${headTags}\n  </head>`);

  if (includeBody && d.bodyHtml) {
    out = out.replace(
      /<div id="root"><\/div>/i,
      `<div id="root"></div>${buildBodyBlock(d.bodyHtml)}`,
    );
  }
  return out;
}

/**
 * Send an enriched response. Only crawlers get the body-content injection; a
 * normal browser gets its head enriched too but receives the untouched body so
 * the SPA experience is byte-for-byte unchanged for interactive users.
 *
 * We enrich the <head> for everyone (invisible, and the SPA's SEO component
 * dedupes/overwrites it on hydration), but we can also choose head-only for
 * humans by passing bot-awareness. Here we only enrich for crawlers to keep the
 * human path identical to today; humans fall through to the SPA catch-all.
 */
export function sendEnriched(
  res: Response,
  shell: string,
  data: SeoData,
  isBot: boolean,
  status = 200,
): void {
  const html = renderEnrichedHtml(shell, data, isBot);
  res
    .status(status)
    .type("html")
    .setHeader("Vary", "User-Agent")
    .setHeader(
      "Cache-Control",
      status === 200
        ? "public, max-age=0, s-maxage=600, stale-while-revalidate=86400"
        : "no-cache",
    );
  res.send(html);
}

// ─── JSON-LD builders (shared shapes) ───────────────────────────────────────

export function breadcrumbList(
  origin: string,
  items: { name: string; path: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${origin}${it.path}`,
    })),
  };
}

export function faqPage(items: { question: string; answer: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}
