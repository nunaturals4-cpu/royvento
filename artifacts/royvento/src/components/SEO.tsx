import { useEffect } from "react";

const SITE_NAME = "Royvento";
const DEFAULT_SITE_URL = "https://royvento.com";
const DEFAULT_OG_IMAGE = "/opengraph.jpg";
const DEFAULT_DESCRIPTION =
  "Discover and book pubs, parties and events across India — rooftop bars, microbreweries, ladies' nights and verified offers. Instant table booking on Royvento.";

const JSON_LD_ATTR = "data-rv-jsonld";

export type JsonLd = Record<string, unknown> | Record<string, unknown>[];

export interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  noindex?: boolean;
  jsonLd?: JsonLd;
}

function siteUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    if (window.location.hostname === "royvento.com" || window.location.hostname.endsWith(".royvento.com")) {
      return DEFAULT_SITE_URL;
    }
    return window.location.origin;
  }
  return DEFAULT_SITE_URL;
}

function absoluteUrl(input?: string): string | undefined {
  if (!input) return undefined;
  if (/^https?:\/\//i.test(input)) return input;
  const base = siteUrl();
  if (input.startsWith("/")) return `${base}${input}`;
  return `${base}/${input}`;
}

function dedupeMeta(attr: "name" | "property", key: string): HTMLMetaElement {
  const all = document.head.querySelectorAll<HTMLMetaElement>(
    `meta[${attr}="${cssEscape(key)}"]`,
  );
  let primary: HTMLMetaElement | null = null;
  all.forEach((el, i) => {
    if (i === 0) primary = el;
    else el.remove();
  });
  if (!primary) {
    primary = document.createElement("meta");
    primary.setAttribute(attr, key);
    document.head.appendChild(primary);
  }
  return primary;
}

function dedupeLink(rel: string): HTMLLinkElement {
  const all = document.head.querySelectorAll<HTMLLinkElement>(
    `link[rel="${cssEscape(rel)}"]`,
  );
  let primary: HTMLLinkElement | null = null;
  all.forEach((el, i) => {
    if (i === 0) primary = el;
    else el.remove();
  });
  if (!primary) {
    primary = document.createElement("link");
    primary.setAttribute("rel", rel);
    document.head.appendChild(primary);
  }
  return primary;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}

function setMeta(attr: "name" | "property", key: string, value: string) {
  if (!value) return;
  const el = dedupeMeta(attr, key);
  el.setAttribute("content", value);
}

function setLink(rel: string, href: string) {
  if (!href) return;
  const el = dedupeLink(rel);
  el.setAttribute("href", href);
}

function clearJsonLd() {
  document.head
    .querySelectorAll(`script[${JSON_LD_ATTR}]`)
    .forEach((el) => el.remove());
}

function appendJsonLd(json: Record<string, unknown>) {
  const el = document.createElement("script");
  el.setAttribute("type", "application/ld+json");
  el.setAttribute(JSON_LD_ATTR, "");
  el.textContent = JSON.stringify(json, (_k, v) => (v === undefined ? undefined : v));
  document.head.appendChild(el);
}

export function SEO({
  title,
  description,
  canonical,
  ogImage,
  ogType = "website",
  noindex,
  jsonLd,
}: SEOProps) {
  useEffect(() => {
    const fullTitle = title ? `${title}` : `${SITE_NAME} — Event Management Platform`;
    document.title = fullTitle;

    const desc = description ?? DEFAULT_DESCRIPTION;
    const canonicalUrl =
      absoluteUrl(canonical) ??
      (typeof window !== "undefined"
        ? `${siteUrl()}${window.location.pathname}`
        : siteUrl());
    const image = absoluteUrl(ogImage ?? DEFAULT_OG_IMAGE);

    setMeta("name", "description", desc);
    setLink("canonical", canonicalUrl);
    setMeta(
      "name",
      "robots",
      noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
    );

    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", ogType);
    setMeta("property", "og:url", canonicalUrl);
    if (image) setMeta("property", "og:image", image);

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", desc);
    if (image) setMeta("name", "twitter:image", image);

    clearJsonLd();
    if (jsonLd) {
      const arr = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      arr.forEach(appendJsonLd);
    }
  }, [title, description, canonical, ogImage, ogType, noindex, JSON.stringify(jsonLd ?? null)]);

  return null;
}

export function buildBreadcrumbList(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.url),
    })),
  };
}

export function buildFAQPage(
  items: { question: string; answer: string }[],
): Record<string, unknown> {
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
