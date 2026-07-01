import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  db,
  vendorsTable,
  eventsTable,
  blogsTable,
  organizersTable,
  seoPagesTable,
} from "@workspace/db";
import { and, eq, desc, ilike, or, isNull, type SQL } from "drizzle-orm";
import { getVendorRatings } from "../lib/aggregates";
import {
  canonicalOrigin,
  isCrawler,
  loadShell,
  sendEnriched,
  escapeHtml,
  toPlainText,
  absoluteUrl,
  breadcrumbList,
  faqPage,
  type SeoData,
  type JsonLd,
} from "../lib/seoRender";

/**
 * Dynamic-rendering router. Enriches the served HTML for CRAWLERS ONLY on
 * public content routes; every other request (and every human) falls through
 * to the existing SPA catch-all untouched. Mounted in app.ts AFTER the static
 * mount and legacy redirects, BEFORE the SPA catch-all.
 *
 * PRIVACY: every query below selects only already-public columns. No user
 * emails/phones, owner ids, balances, ticket salts, or partner support contacts
 * ever reach the rendered HTML.
 */

const ORG_SAME_AS = [
  "https://www.instagram.com/royvento",
  "https://www.facebook.com/royvento",
  "https://twitter.com/royvento",
  "https://www.linkedin.com/company/royvento",
  "https://www.youtube.com/@royvento",
];

function organizationNode(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Royvento",
    url: `${origin}/`,
    logo: `${origin}/images/logo.png`,
    image: `${origin}/opengraph.jpg`,
    description:
      "Royvento is India's platform to discover and book pubs, clubs, parties, events, games and local nightlife experiences — plus verified Solo Connect groups and private parties.",
    areaServed: { "@type": "Country", name: "India" },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${origin}/contact`,
      areaServed: "IN",
      availableLanguage: ["en", "hi"],
    },
    sameAs: ORG_SAME_AS,
  };
}

function websiteNode(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Royvento",
    url: `${origin}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/pubs?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

// ─── slug / city helpers (kept in sync with sitemap.ts / seo.ts) ─────────────

const CITY_ALIAS_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["bangalore", "bengaluru"],
  ["mumbai", "bombay"],
  ["gurgaon", "gurugram"],
  ["kolkata", "calcutta"],
  ["chennai", "madras"],
  ["pune", "poona"],
];

function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function expandCityAliases(input: string): string[] {
  const norm = slugify(input);
  if (!norm) return [];
  for (const group of CITY_ALIAS_GROUPS) {
    if (group.includes(norm)) return [...group];
  }
  return [norm];
}

function titleCase(input: string): string {
  return input
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cityWhere(citySlug: string): SQL | undefined {
  const variants = expandCityAliases(citySlug);
  const conds = variants.map((v) => ilike(vendorsTable.city, `%${v}%`));
  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0]!;
  return or(...conds);
}

// Single-segment top-level paths that are NOT cities — reserved SPA routes,
// asset prefixes and sitemap files. Requests for these skip the greedy /:city
// handler so we never run a city query for /login, /favicon.png, etc.
const RESERVED_TOP: ReadonlySet<string> = new Set([
  "pubs", "events", "blogs", "blog", "vendors", "partners", "games",
  "private-parties", "solo-connect", "tonight-plans", "pub-offers", "explore",
  "hot-deals", "premium", "contact", "terms", "privacy", "community-guidelines",
  "subscription", "login", "register", "dashboard", "admin", "profile",
  "wishlist", "notifications", "bookings", "payment-result", "reset-password",
  "forgot-password", "become-vendor", "split-expense", "party", "organizers",
  "organizer-events", "game-organizers", "api", "assets", "images", "favicon",
  "favicon.png", "favicon.svg", "manifest.json", "robots.txt", "llms.txt",
  "llms-full.txt", "sw.js", "opengraph.jpg",
]);

// ─── shared list rendering ──────────────────────────────────────────────────

function listBody(intro: string, items: { name: string; url: string }[]): string {
  const li = items
    .map((it) => `<li><a href="${escapeHtml(it.url)}">${escapeHtml(it.name)}</a></li>`)
    .join("");
  return `<p>${escapeHtml(intro)}</p>${li ? `<ul>${li}</ul>` : ""}`;
}

function itemListNode(items: { name: string; url: string }[], type = "BarOrPub"): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: it.url,
      item: { "@type": type, name: it.name, url: it.url },
    })),
  };
}

export function makeHtmlSeoRouter(indexPath: string): IRouter {
  const router: IRouter = Router();

  const shell = () => loadShell(indexPath);
  const bot = (req: Request) => isCrawler(req.get("user-agent"));

  // Wrap a handler so any DB / render error degrades gracefully to the SPA
  // shell (via next()) instead of erroring the page.
  const safe =
    (fn: (req: Request, res: Response) => Promise<boolean>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const handled = await fn(req, res);
        if (!handled) next();
      } catch {
        next(); // fall through to SPA catch-all; page still loads
      }
    };

  // ── Home ──────────────────────────────────────────────────────────────────
  router.get("/", safe(async (req, res) => {
    const origin = canonicalOrigin(req);
    const data: SeoData = {
      title: "Royvento — Book Pubs, Parties & Events Across India",
      description:
        "Discover and book pubs, clubs, parties and events across India — rooftop bars, microbreweries, ladies' nights, live music, Solo Connect groups and verified offers. Instant table booking on Royvento.",
      canonical: `${origin}/`,
      jsonLd: [
        organizationNode(origin),
        websiteNode(origin),
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Royvento — Book Pubs, Parties & Events Across India",
          url: `${origin}/`,
          isPartOf: { "@type": "WebSite", url: `${origin}/` },
        },
      ],
      bodyHtml:
        `<h1>Royvento — book pubs, clubs, events, games and experiences across India</h1>` +
        `<p>Royvento helps you discover and instantly book the best pubs and clubs, nightlife events and parties, games and local experiences across India. Explore rooftop bars, microbreweries, lounges, live music and sports bars; find today's drink offers and ladies' nights; join verified Solo Connect groups; and create or join private parties.</p>` +
        listBody("Explore Royvento:", [
          { name: "Pubs & Clubs", url: `${origin}/pubs` },
          { name: "Offers & Deals", url: `${origin}/pub-offers` },
          { name: "Events & Parties", url: `${origin}/events` },
          { name: "Games & Sports", url: `${origin}/games` },
          { name: "Solo Connect", url: `${origin}/solo-connect` },
          { name: "Private Parties", url: `${origin}/private-parties` },
          { name: "Blog", url: `${origin}/blogs` },
        ]),
    };
    sendEnriched(res, shell(), data, bot(req));
    return true;
  }));

  // ── Static informational routes (head-only enrichment) ─────────────────────
  const STATIC: Record<string, { title: string; description: string }> = {
    "/contact": {
      title: "Contact Royvento — Support & Partnerships",
      description:
        "Get in touch with Royvento for support, partner onboarding, or press. Book pubs, events and experiences across India.",
    },
    "/subscription": {
      title: "Royvento Premium — Membership & Benefits",
      description:
        "Royvento Premium unlocks exclusive pub offers, priority booking and member perks across India's nightlife.",
    },
    "/terms": {
      title: "Terms of Service | Royvento",
      description: "The terms governing use of Royvento's pub, event and experience booking platform.",
    },
    "/privacy": {
      title: "Privacy Policy | Royvento",
      description: "How Royvento collects, uses and protects your data.",
    },
    "/community-guidelines": {
      title: "Community Guidelines | Royvento",
      description: "The rules that keep Royvento's Solo Connect groups, parties and community safe and respectful.",
    },
  };
  for (const [path, meta] of Object.entries(STATIC)) {
    router.get(path, safe(async (req, res) => {
      const origin = canonicalOrigin(req);
      sendEnriched(res, shell(), {
        title: meta.title,
        description: meta.description,
        canonical: `${origin}${path}`,
        jsonLd: [breadcrumbList(origin, [
          { name: "Home", path: "/" },
          { name: meta.title.split("|")[0]!.split("—")[0]!.trim(), path },
        ])],
      }, bot(req));
      return true;
    }));
  }

  // ── Listing / vertical pages ───────────────────────────────────────────────
  interface VerticalDef {
    path: string;
    title: string;
    description: string;
    intro: string;
    // optional live ItemList of approved vendors
    withVendors?: boolean;
  }
  const VERTICALS: VerticalDef[] = [
    {
      path: "/pubs",
      title: "Best Pubs & Clubs in India — Book a Table | Royvento",
      description:
        "Browse and instantly book the best pubs, clubs, rooftop bars, microbreweries and lounges across India. Live offers, ladies' nights and verified venues on Royvento.",
      intro: "Discover and book the best pubs, clubs, rooftop bars and microbreweries across India:",
      withVendors: true,
    },
    {
      path: "/pub-offers",
      title: "Today's Pub Offers, Drink Deals & Ladies' Nights | Royvento",
      description:
        "Live drink deals, happy hours, ladies' nights and weekend offers at pubs and clubs across India. Book a table and save with verified Royvento offers.",
      intro: "Today's verified drink offers, happy hours and ladies' nights at pubs across India:",
      withVendors: true,
    },
    {
      path: "/events",
      title: "Nightlife Events, Concerts & Parties in India | Royvento",
      description:
        "Find and book nightlife events, concerts, DJ nights and parties across India. Tickets, timings and venues — all on Royvento.",
      intro: "Upcoming nightlife events, concerts, DJ nights and parties across India:",
    },
    {
      path: "/games",
      title: "Games & Sports Venues — Book & Play | Royvento",
      description:
        "Book gaming lounges, sports bars, arcades and activity venues across India on Royvento.",
      intro: "Book games, sports and activity venues across India:",
    },
    {
      path: "/private-parties",
      title: "Create & Join Private Parties in India | Royvento",
      description:
        "Create your own party or join private, ticketed parties across India. Gender-gated, verified and easy to book on Royvento.",
      intro: "Create your own party or join private, ticketed parties across India:",
    },
    {
      path: "/solo-connect",
      title: "Solo Connect — Verified Same-City Activity Groups | Royvento",
      description:
        "Royvento Solo Connect brings together verified, single-gender, same-city activity groups for nightlife, events and experiences across India. Safe and community-first — not a dating app.",
      intro:
        "Solo Connect is Royvento's verified, single-gender, same-city activity community for going out together — nightlife, events and experiences. It is safety-first and is not a dating app.",
    },
    {
      path: "/tonight-plans",
      title: "Things To Do Tonight Near You | Royvento",
      description:
        "Real-time plans for tonight — pubs, parties, events and last-minute deals happening now near you across India. Book instantly on Royvento.",
      intro: "Real-time plans for tonight — what's happening and starting soon near you:",
    },
  ];

  for (const v of VERTICALS) {
    router.get(v.path, safe(async (req, res) => {
      const origin = canonicalOrigin(req);
      const jsonLd: JsonLd[] = [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: v.title,
          url: `${origin}${v.path}`,
          description: v.description,
          isPartOf: { "@type": "WebSite", url: `${origin}/` },
        },
        breadcrumbList(origin, [
          { name: "Home", path: "/" },
          { name: v.title.split("—")[0]!.split("|")[0]!.trim(), path: v.path },
        ]),
      ];
      let body = `<h1>${escapeHtml(v.title.split("|")[0]!.trim())}</h1>`;
      if (v.withVendors) {
        const rows = await db
          .select({
            id: vendorsTable.id,
            businessName: vendorsTable.businessName,
            city: vendorsTable.city,
          })
          .from(vendorsTable)
          .where(and(eq(vendorsTable.status, "approved"), eq(vendorsTable.hidden, false)))
          .orderBy(desc(vendorsTable.isPremium), desc(vendorsTable.createdAt))
          .limit(24);
        const items = rows.map((r) => ({
          name: r.businessName,
          url: `${origin}/pubs/${slugify(r.city) || "city"}/${slugify(r.businessName) || "pub"}-${r.id}`,
        }));
        jsonLd.push(itemListNode(items));
        body += listBody(v.intro, items);
      } else {
        body += `<p>${escapeHtml(v.intro)}</p>`;
      }
      sendEnriched(res, shell(), {
        title: v.title,
        description: v.description,
        canonical: `${origin}${v.path}`,
        jsonLd,
        bodyHtml: body,
      }, bot(req));
      return true;
    }));
  }

  // ── Pub / venue detail: /pubs/:city/:slug (slug ends with -<id>) ────────────
  router.get("/pubs/:city/:slug", safe(async (req, res) => {
    const id = Number(String(req.params.slug ?? "").match(/-(\d+)$/)?.[1]);
    if (!Number.isFinite(id) || id <= 0) return false;
    const rows = await db
      .select({
        id: vendorsTable.id,
        businessName: vendorsTable.businessName,
        category: vendorsTable.category,
        description: vendorsTable.description,
        city: vendorsTable.city,
        state: vendorsTable.state,
        country: vendorsTable.country,
        address: vendorsTable.address,
        location: vendorsTable.location,
        bannerImage: vendorsTable.bannerImage,
        coverImageUrl: vendorsTable.coverImageUrl,
        openDays: vendorsTable.openDays,
      })
      .from(vendorsTable)
      .where(and(eq(vendorsTable.id, id), eq(vendorsTable.status, "approved"), eq(vendorsTable.hidden, false)))
      .limit(1);
    const v = rows[0];
    const origin = canonicalOrigin(req);
    if (!v) {
      // Hard 404 with noindex — kills the soft-404 for stale/removed venues.
      sendEnriched(res, shell(), {
        title: "Venue not found | Royvento",
        description: "This venue is no longer available on Royvento.",
        canonical: `${origin}/pubs`,
        noindex: true,
        bodyHtml: `<h1>Venue not found</h1><p><a href="${origin}/pubs">Browse pubs & clubs</a></p>`,
      }, bot(req), 404);
      return true;
    }
    const canonical = `${origin}/pubs/${req.params.city}/${req.params.slug}`;
    const rating = (await getVendorRatings([v.id])).get(v.id) ?? { rating: 0, reviewCount: 0 };
    const cityName = v.city || "India";
    const image = absoluteUrl(origin, v.bannerImage || v.coverImageUrl || null);
    const desc =
      toPlainText(v.description, 155) ||
      `Book a table at ${v.businessName}, a ${v.category} in ${cityName}. Offers, timings, reviews and instant booking on Royvento.`;
    const barNode: JsonLd = {
      "@context": "https://schema.org",
      "@type": "BarOrPub",
      name: v.businessName,
      url: canonical,
      ...(image ? { image } : {}),
      ...(v.description ? { description: toPlainText(v.description, 500) } : {}),
      address: {
        "@type": "PostalAddress",
        streetAddress: v.address || v.location || undefined,
        addressLocality: v.city || undefined,
        addressRegion: v.state || undefined,
        addressCountry: v.country || "IN",
      },
      ...(v.openDays && v.openDays.length ? { openingHours: v.openDays } : {}),
      ...(rating.rating > 0 && rating.reviewCount > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: Number(rating.rating.toFixed(1)),
              reviewCount: rating.reviewCount,
              bestRating: 5,
            },
          }
        : {}),
    };
    sendEnriched(res, shell(), {
      title: `${v.businessName} — ${v.category} in ${cityName} | Royvento`,
      description: desc,
      canonical,
      ogImage: image,
      ogType: "business.business",
      jsonLd: [
        barNode,
        breadcrumbList(origin, [
          { name: "Home", path: "/" },
          { name: "Pubs", path: "/pubs" },
          { name: titleCase(cityName), path: `/${slugify(cityName)}` },
          { name: v.businessName, path: `/pubs/${req.params.city}/${req.params.slug}` },
        ]),
      ],
      bodyHtml:
        `<h1>${escapeHtml(v.businessName)}</h1>` +
        `<p>${escapeHtml(v.category)} in ${escapeHtml(cityName)}${v.state ? ", " + escapeHtml(v.state) : ""}.</p>` +
        (v.description ? `<p>${escapeHtml(toPlainText(v.description, 600))}</p>` : "") +
        (v.address ? `<p>Address: ${escapeHtml(v.address)}</p>` : "") +
        (rating.rating > 0 && rating.reviewCount > 0
          ? `<p>Rated ${rating.rating.toFixed(1)}/5 from ${rating.reviewCount} reviews.</p>`
          : ""),
    }, bot(req));
    return true;
  }));

  // ── Event detail: /events/:city/:slug (slug ends with -<id>) ────────────────
  router.get("/events/:city/:slug", safe(async (req, res) => {
    const id = Number(String(req.params.slug ?? "").match(/-(\d+)$/)?.[1]);
    if (!Number.isFinite(id) || id <= 0) return false;
    const rows = await db
      .select({
        id: eventsTable.id,
        title: eventsTable.title,
        description: eventsTable.description,
        category: eventsTable.category,
        city: eventsTable.city,
        state: eventsTable.state,
        country: eventsTable.country,
        location: eventsTable.location,
        price: eventsTable.price,
        imageUrl: eventsTable.imageUrl,
        eventDate: eventsTable.eventDate,
        startTime: eventsTable.startTime,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.id, id), eq(eventsTable.approvalStatus, "approved"), eq(eventsTable.hidden, false)))
      .limit(1);
    const ev = rows[0];
    const origin = canonicalOrigin(req);
    if (!ev) {
      sendEnriched(res, shell(), {
        title: "Event not found | Royvento",
        description: "This event is no longer available on Royvento.",
        canonical: `${origin}/events`,
        noindex: true,
        bodyHtml: `<h1>Event not found</h1><p><a href="${origin}/events">Browse events</a></p>`,
      }, bot(req), 404);
      return true;
    }
    const canonical = `${origin}/events/${req.params.city}/${req.params.slug}`;
    const cityName = ev.city || "India";
    const image = absoluteUrl(origin, ev.imageUrl || null);
    const startIso =
      ev.eventDate
        ? `${String(ev.eventDate).slice(0, 10)}${ev.startTime ? `T${ev.startTime.length === 5 ? ev.startTime : ev.startTime.slice(0, 5)}:00` : ""}`
        : undefined;
    const price = Number(ev.price ?? 0);
    const eventNode: JsonLd = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: ev.title,
      url: canonical,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      ...(ev.description ? { description: toPlainText(ev.description, 500) } : {}),
      ...(image ? { image } : {}),
      ...(startIso ? { startDate: startIso } : {}),
      location: {
        "@type": "Place",
        name: ev.location || cityName,
        address: {
          "@type": "PostalAddress",
          addressLocality: ev.city || undefined,
          addressRegion: ev.state || undefined,
          addressCountry: ev.country || "IN",
        },
      },
      offers: {
        "@type": "Offer",
        price: price.toFixed(2),
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        url: canonical,
      },
    };
    sendEnriched(res, shell(), {
      title: `${ev.title}${cityName ? ` — ${cityName}` : ""} | Royvento`,
      description:
        toPlainText(ev.description, 155) ||
        `${ev.title} in ${cityName}. Get tickets, timings and venue details on Royvento.`,
      canonical,
      ogImage: image,
      ogType: "event",
      jsonLd: [
        eventNode,
        breadcrumbList(origin, [
          { name: "Home", path: "/" },
          { name: "Events", path: "/events" },
          { name: ev.title, path: `/events/${req.params.city}/${req.params.slug}` },
        ]),
      ],
      bodyHtml:
        `<h1>${escapeHtml(ev.title)}</h1>` +
        `<p>${escapeHtml(ev.category)} in ${escapeHtml(cityName)}.</p>` +
        (startIso ? `<p>Date: ${escapeHtml(String(ev.eventDate).slice(0, 10))}${ev.startTime ? ` ${escapeHtml(ev.startTime)}` : ""}</p>` : "") +
        (ev.description ? `<p>${escapeHtml(toPlainText(ev.description, 600))}</p>` : "") +
        `<p>${price > 0 ? `From ₹${price.toFixed(0)}` : "Free entry / on the door"}.</p>`,
    }, bot(req));
    return true;
  }));

  // ── Blog listing ────────────────────────────────────────────────────────────
  router.get("/blogs", safe(async (req, res) => {
    const origin = canonicalOrigin(req);
    const rows = await db
      .select({ title: blogsTable.title, slug: blogsTable.slug })
      .from(blogsTable)
      .where(eq(blogsTable.published, true))
      .orderBy(desc(blogsTable.createdAt))
      .limit(30);
    const items = rows.map((r) => ({ name: r.title, url: `${origin}/blogs/${encodeURIComponent(r.slug)}` }));
    sendEnriched(res, shell(), {
      title: "Royvento Blog — Nightlife Guides & Things To Do in India",
      description:
        "Guides to the best pubs, clubs, events and things to do across India's cities — curated by the Royvento editorial team.",
      canonical: `${origin}/blogs`,
      jsonLd: [
        { "@context": "https://schema.org", "@type": "Blog", name: "Royvento Blog", url: `${origin}/blogs` },
        breadcrumbList(origin, [{ name: "Home", path: "/" }, { name: "Blog", path: "/blogs" }]),
        itemListNode(items, "BlogPosting"),
      ],
      bodyHtml: `<h1>Royvento Blog</h1>` + listBody("Latest guides and things to do:", items),
    }, bot(req));
    return true;
  }));

  // ── Blog detail: /blogs/:slug ───────────────────────────────────────────────
  router.get("/blogs/:slug", safe(async (req, res) => {
    const slug = String(req.params.slug ?? "");
    if (!slug) return false;
    const rows = await db
      .select({
        title: blogsTable.title,
        slug: blogsTable.slug,
        excerpt: blogsTable.excerpt,
        content: blogsTable.content,
        imageUrl: blogsTable.imageUrl,
        authorName: blogsTable.authorName,
        createdAt: blogsTable.createdAt,
      })
      .from(blogsTable)
      .where(and(eq(blogsTable.slug, slug), eq(blogsTable.published, true)))
      .limit(1);
    const b = rows[0];
    const origin = canonicalOrigin(req);
    if (!b) {
      sendEnriched(res, shell(), {
        title: "Article not found | Royvento",
        description: "This article is no longer available on Royvento.",
        canonical: `${origin}/blogs`,
        noindex: true,
        bodyHtml: `<h1>Article not found</h1><p><a href="${origin}/blogs">Read the Royvento blog</a></p>`,
      }, bot(req), 404);
      return true;
    }
    const canonical = `${origin}/blogs/${encodeURIComponent(b.slug)}`;
    const image = absoluteUrl(origin, b.imageUrl || null);
    const iso = b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt);
    sendEnriched(res, shell(), {
      title: `${b.title} | Royvento Blog`,
      description: toPlainText(b.excerpt || b.content, 155),
      canonical,
      ogImage: image,
      ogType: "article",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: b.title,
          ...(image ? { image } : {}),
          datePublished: iso,
          dateModified: iso,
          author: { "@type": "Organization", name: b.authorName || "Royvento Editorial" },
          publisher: {
            "@type": "Organization",
            name: "Royvento",
            logo: { "@type": "ImageObject", url: `${origin}/images/logo.png` },
          },
          mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
          description: toPlainText(b.excerpt || b.content, 300),
        },
        breadcrumbList(origin, [
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blogs" },
          { name: b.title, path: `/blogs/${encodeURIComponent(b.slug)}` },
        ]),
      ],
      bodyHtml:
        `<article><h1>${escapeHtml(b.title)}</h1>` +
        `<p>By ${escapeHtml(b.authorName || "Royvento Editorial")}</p>` +
        `<p>${escapeHtml(toPlainText(b.content || b.excerpt, 1200))}</p></article>`,
    }, bot(req));
    return true;
  }));

  // ── Public organizer profile: /organizers/:slug ─────────────────────────────
  router.get("/organizers/:slug", safe(async (req, res) => {
    const slug = String(req.params.slug ?? "");
    if (!slug) return false;
    const rows = await db
      .select({
        name: organizersTable.name,
        slug: organizersTable.slug,
        description: organizersTable.description,
        logoUrl: organizersTable.logoUrl,
        coverImageUrl: organizersTable.coverImageUrl,
        website: organizersTable.website,
        instagram: organizersTable.instagram,
        facebook: organizersTable.facebook,
        youtube: organizersTable.youtube,
        city: organizersTable.city,
        state: organizersTable.state,
      })
      .from(organizersTable)
      .where(and(eq(organizersTable.slug, slug), eq(organizersTable.status, "approved"), eq(organizersTable.hidden, false)))
      .limit(1);
    const o = rows[0];
    const origin = canonicalOrigin(req);
    if (!o) return false; // let SPA render (may be a pending/preview profile)
    const canonical = `${origin}/organizers/${encodeURIComponent(o.slug)}`;
    const image = absoluteUrl(origin, o.coverImageUrl || o.logoUrl || null);
    // Public brand links only — never support email / phone.
    const sameAs = [o.website, o.instagram, o.facebook, o.youtube].filter(
      (u): u is string => !!u && /^https?:\/\//i.test(u),
    );
    sendEnriched(res, shell(), {
      title: `${o.name} — Event Organizer${o.city ? ` in ${o.city}` : ""} | Royvento`,
      description:
        toPlainText(o.description, 155) ||
        `${o.name} hosts events on Royvento${o.city ? ` in ${o.city}` : ""}. See upcoming events and book tickets.`,
      canonical,
      ogImage: image,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: o.name,
          url: canonical,
          ...(image ? { image, logo: absoluteUrl(origin, o.logoUrl || null) } : {}),
          ...(o.description ? { description: toPlainText(o.description, 500) } : {}),
          ...(sameAs.length ? { sameAs } : {}),
        },
        breadcrumbList(origin, [
          { name: "Home", path: "/" },
          { name: "Organizers", path: "/events" },
          { name: o.name, path: `/organizers/${encodeURIComponent(o.slug)}` },
        ]),
      ],
      bodyHtml:
        `<h1>${escapeHtml(o.name)}</h1>` +
        `<p>Event organizer${o.city ? ` in ${escapeHtml(o.city)}` : ""} on Royvento.</p>` +
        (o.description ? `<p>${escapeHtml(toPlainText(o.description, 600))}</p>` : ""),
    }, bot(req));
    return true;
  }));

  // ── City landing: /:city  and  /:city/:second ───────────────────────────────
  async function renderCity(req: Request, res: Response, citySlugRaw: string, secondRaw?: string): Promise<boolean> {
    const citySlug = slugify(citySlugRaw);
    if (!citySlug || RESERVED_TOP.has(citySlug) || RESERVED_TOP.has(citySlugRaw)) return false;
    const where = cityWhere(citySlug);
    if (!where) return false;
    const rows = await db
      .select({ id: vendorsTable.id, businessName: vendorsTable.businessName, city: vendorsTable.city, address: vendorsTable.address, category: vendorsTable.category })
      .from(vendorsTable)
      .where(and(eq(vendorsTable.status, "approved"), eq(vendorsTable.hidden, false), where))
      .orderBy(desc(vendorsTable.isPremium), desc(vendorsTable.createdAt))
      .limit(200);
    if (rows.length === 0) return false; // not a known city — let SPA handle

    const origin = canonicalOrigin(req);
    const cityName = titleCase(citySlug);
    const second = secondRaw ? slugify(secondRaw) : "";

    // Optional editorial override from seo_pages.
    const template = second ? "locality" : "city";
    let ovTitle: string | null = null;
    let ovDesc: string | null = null;
    let ovIntro = "";
    try {
      const seoRows = await db
        .select()
        .from(seoPagesTable)
        .where(and(
          eq(seoPagesTable.template, template),
          eq(seoPagesTable.citySlug, citySlug),
          second ? eq(seoPagesTable.secondSlug, second) : isNull(seoPagesTable.secondSlug),
        ))
        .limit(1);
      if (seoRows[0]) {
        ovTitle = seoRows[0].title ?? null;
        ovDesc = seoRows[0].metaDescription ?? null;
        ovIntro = seoRows[0].introMd ?? "";
      }
    } catch { /* editorial overrides optional */ }

    // Filter to locality when a second segment is present.
    let filtered = rows;
    let secondName = "";
    if (second) {
      secondName = titleCase(second);
      filtered = rows.filter((r) => {
        const parts = (r.address ?? "").split(",").map((s) => slugify(s.trim()));
        const catMatch = slugify(r.category ?? "").includes(second);
        return parts.includes(second) || catMatch;
      });
      if (filtered.length === 0) return false;
    }

    const path = second ? `/${citySlug}/${second}` : `/${citySlug}`;
    const items = filtered.slice(0, 24).map((r) => ({
      name: r.businessName,
      url: `${origin}/pubs/${slugify(r.city) || citySlug}/${slugify(r.businessName) || "pub"}-${r.id}`,
    }));
    const label = second ? `${secondName}, ${cityName}` : cityName;
    const title = ovTitle || `Best Pubs & Clubs in ${label} — Book a Table | Royvento`;
    const description =
      ovDesc ||
      `${filtered.length}+ pubs, clubs, rooftop bars and party venues in ${label}. Today's offers, ladies' nights and instant table booking on Royvento.`;

    const faqs = [
      {
        question: `What are the best pubs and clubs in ${label}?`,
        answer: `Royvento lists ${filtered.length}+ verified pubs, clubs and bars in ${label}, including rooftop bars, microbreweries, lounges and live-music venues you can book instantly.`,
      },
      {
        question: `Can I book a table at a pub in ${label} online?`,
        answer: `Yes. You can browse venues in ${label} on Royvento, check today's offers and ladies' nights, and book a table instantly.`,
      },
    ];

    sendEnriched(res, shell(), {
      title,
      description,
      canonical: `${origin}${path}`,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: title,
          url: `${origin}${path}`,
          description,
          about: { "@type": "City", name: cityName },
          isPartOf: { "@type": "WebSite", url: `${origin}/` },
        },
        itemListNode(items),
        breadcrumbList(origin, second
          ? [{ name: "Home", path: "/" }, { name: cityName, path: `/${citySlug}` }, { name: secondName, path }]
          : [{ name: "Home", path: "/" }, { name: cityName, path }]),
        faqPage(faqs),
      ],
      bodyHtml:
        `<h1>Best pubs & clubs in ${escapeHtml(label)}</h1>` +
        (ovIntro ? `<p>${escapeHtml(toPlainText(ovIntro, 600))}</p>` : `<p>${escapeHtml(description)}</p>`) +
        listBody(`Top venues in ${label}:`, items),
    }, bot(req));
    return true;
  }

  router.get("/:city/:second", safe(async (req, res) =>
    renderCity(req, res, String(req.params.city ?? ""), String(req.params.second ?? "")),
  ));
  router.get("/:city", safe(async (req, res) =>
    renderCity(req, res, String(req.params.city ?? "")),
  ));

  return router;
}
