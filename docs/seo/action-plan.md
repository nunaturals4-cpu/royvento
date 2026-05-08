# Royvento — SEO Action Plan (Prioritized)

Buckets: **Easy wins (≤2 weeks)**, **Medium (2–8 weeks)**, **Long-term (8+ weeks)**.
Effort: **S** ≤1 dev-day, **M** 2–5 dev-days, **L** >1 dev-week.

Use this as the source for the next round of follow-up tasks. Each row maps to concrete files in the repo so engineering can scope quickly.

---

## Easy wins (do first)

| # | Task | Effort | Impact | Owner | Repo touchpoints |
|---|------|--------|--------|-------|------------------|
| E1 | Per-route `<title>`, meta description, canonical, OG/Twitter via a `<SEO />` component (react-helmet-async) | S | High | eng | `artifacts/royvento/src/main.tsx`, new `src/components/SEO.tsx`, used in every page in `src/pages/*` |
| E2 | Default OG image + per-template OG image overrides (city, pub, event, offer) | S | Med | eng + design | `artifacts/royvento/public/opengraph.jpg`, dynamic OG via SEO component |
| E3 | Generate `sitemap.xml` from DB (cities, pubs, events, offers, blogs) — split into `sitemap-pubs.xml`, `sitemap-events.xml`, `sitemap-cities.xml`, `sitemap-blogs.xml`, plus `sitemap-index.xml` | M | High | eng | new route `artifacts/api-server/src/routes/sitemap.ts`, served at `/sitemap.xml` and `/sitemap-*.xml` |
| E4 | `robots.txt` allowing public templates, blocking `/dashboard/*`, `/admin`, `/payment-result`, `/profile`, query-string facets | S | Med | eng | `artifacts/royvento/public/robots.txt` |
| E5 | JSON-LD on existing pages: `Organization` + `WebSite` + `SearchAction` (home), `LocalBusiness/BarOrPub` (vendor detail), `Event` + `Offer` (event detail), `BlogPosting` (blog), `BreadcrumbList` (all detail) | M | High | eng | `src/pages/home.tsx`, `vendor-detail.tsx`, `event-detail.tsx`, `blog-detail.tsx`, `pubs.tsx`, `pub-offers.tsx` |
| E6 | Friendly slugs for vendors and events (`/pubs/{city}/{slug}-{id}`, `/events/{city}/{slug}-{id}`) with 301 from old `/vendors/:id` and `/events/:id` | M | High | eng | `App.tsx` routes, `vendor-detail.tsx`, `event-detail.tsx`, server `routes/vendors.ts`, `routes/events.ts` for slug-aware lookup |
| E7 | H1/H2 audit pass on home, explore, pubs, pub-offers, vendors, blogs (one H1 only, keyword-rich) | S | Med | eng + content | `src/pages/{home,explore,pubs,pub-offers,vendors,blogs}.tsx` |
| E8 | Image ALT pattern (`{Pub Name} — {category} in {locality}, {city}`) on all `<img>` in vendor/event/pub cards | S | Med | eng | `src/components/cards/*` |
| E9 | Link blog posts <-> city/locality/category pages in both directions ("Related reads" rail on programmatic pages, "Book a table" rail on blogs) | S | Med | eng + content | `src/pages/blog-detail.tsx`, `pubs.tsx`, programmatic templates |
| E10 | Submit verified GBP onboarding checklist to all live partners (1-pager from playbook §4) | S | High | ops + partner | none (ops doc) |
| E11 | Replace empty `<title>Royvento — Event Management Platform</title>` in `index.html` is fine, but add description and theme-color, plus `apple-touch-icon` | S | Low | eng | `artifacts/royvento/index.html` |
| E12 | Block indexable thin/auth pages via `noindex` meta where applicable (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/payment-result`, `/notifications`, `/wishlist`, `/profile`, `/dashboard/*`, `/admin`) | S | Med | eng | SEO component prop on those page components |

## Medium (next 2–8 weeks)

| # | Task | Effort | Impact | Owner | Repo touchpoints |
|---|------|--------|--------|-------|------------------|
| M1 | City landing pages template `/{city}` (e.g. `/bangalore`) with hero, top pubs, top localities, top offers, FAQs | L | High | eng + content | new `src/pages/city.tsx`, `App.tsx`, server: `GET /api/cities/{slug}/summary` (new) |
| M2 | Locality pages `/{city}/{locality}` (e.g. `/bangalore/indiranagar`) | L | High | eng + content | new `src/pages/locality.tsx`, server endpoint, area data on `vendors` |
| M3 | Category pages `/{city}/{category}` (rooftop, microbrewery, sports-bar, live-music, couple-friendly) | L | High | eng + content | new `src/pages/category.tsx`; ensure `vendors` table carries category tags |
| M4 | Programmatic occasion pages `/pub-offers/{occasion}-{city}` (nye, christmas, valentines, halloween, holi, diwali, ipl) — generated from offer/event data with editorial intro per city | L | High | eng + content | extend `pub-offers.tsx` or new `occasion-city.tsx` |
| M5 | Prerender (or SSR) for crawlable templates (home, city, locality, category, pub, event, offer, blog) — react-snap or Vite SSR; SPA fallback for dashboards | L | High | eng | `artifacts/royvento/vite.config.ts`, build pipeline; or move public routes to a thin SSR shell |
| M6 | Core Web Vitals pass: route-split heavy libs, defer below-the-fold images, set `loading="lazy"` + `decoding="async"`, inline critical CSS for home/city, preconnect to image CDN | M | High | eng | `vite.config.ts`, image components, `index.html` |
| M7 | Image CDN with `srcset` + AVIF/WebP, sized by viewport (LCP win) | M | High | eng | image component, server uploads pipeline |
| M8 | FAQ blocks + `FAQPage` schema on city, locality, category, pub, event templates | M | Med | eng + content | per-template FAQ data |
| M9 | Review schema (`AggregateRating`, `Review`) on pub/event detail when ≥3 reviews | S | Med | eng | `vendor-detail.tsx`, `event-detail.tsx` |
| M10 | Open Graph + Twitter Card validation pass + LinkedIn preview check | S | Med | eng | SEO component |
| M11 | Internal-search Sitelinks-friendly markup (`SearchAction` + `/search?q=`) | S | Low | eng | home page schema |
| M12 | Blog author bios + editorial policy page + transparency page (E-E-A-T) | M | Med | content + eng | new `src/pages/editorial-policy.tsx`, `src/pages/about.tsx`, blog author component |
| M13 | "Top 10 most-booked pubs in {city} this month" auto-refresh module on city page (freshness signal) | M | Med | eng | server aggregation route + city template |
| M14 | Migration audit: 301 map for any legacy URLs (`/hot-deals` → `/pub-offers` exists; document and add to sitemap exclusions) | S | Low | eng | `App.tsx`, sitemap generator |

## Long-term (8+ weeks)

| # | Task | Effort | Impact | Owner | Repo touchpoints |
|---|------|--------|--------|-------|------------------|
| L1 | Dedicated SSR/edge-rendered public site (Next.js or Vite SSR) for indexable templates while keeping booking flows in SPA | L | High | eng | Architectural — separate package or convert royvento artifact |
| L2 | Programmatic pages at scale: ~250 city×category, ~1500 city×locality, ~500 occasion×city — guarded by thin-content rules (min 6 pubs, min 200 words editorial, unique FAQs) | L | High | eng + content + ops | pages, content templates, indexability rules |
| L3 | Backlink program: city lifestyle blog outreach (LBB, Curly Tales, Whats Hot, Homegrown, MetroSaga, Magicpin Blog), college-fest sponsorships, year-end "India Nightlife Report" PR push | L | High | content + ops | none (off-site) |
| L4 | Original-data assets ("Most-booked pub", "Most-Instagrammed strip", "Average NYE cover by city") republished annually as link bait | L | High | content + data | analytics queries on bookings/events |
| L5 | Vendor verification badge + on-page trust block (verified by Royvento, X bookings/month, Y reviews) | M | Med | eng + ops | vendor schema + vendor-detail UI |
| L6 | Voice-search & AI-Overview optimization: definition snippets, "best X in Y" tables, FAQ pairs phrased as natural questions, llms.txt | M | Med | content + eng | per-template content + new `public/llms.txt` |
| L7 | hreflang for `en-IN` (and add city-specific subpaths) — only if/when international or regional language variants ship | L | Low (now) | eng | SEO component |
| L8 | Internationalization for top metros in Hindi/Kannada/Tamil/Marathi (separate URL paths `/hi/`, `/kn/` etc.) — only after English program proves out | L | Med | eng + i18n | `src/i18n` already present; expand |
| L9 | Multilingual content for tier-2 cities + university towns (Mysuru, Vizag, Coimbatore, Surat, Bhopal, Nagpur) | L | Med | content | content engine |

---

## Expected growth timeline (India nightlife/event vertical benchmarks)

> Assumes execution of all "Easy wins" within 3 weeks, all "Medium" within 8 weeks, and a sustained content/backlink cadence. Numbers are realistic ranges for a brand entering an established SERP, not projections.

- **0–3 months**: Indexation of all pub/event/offer pages; brand SERP cleaned (knowledge panel, sitelinks); 5–15k organic sessions/month on brand + tier-1 city long-tail.
- **3–6 months**: Programmatic city/locality/category pages start ranking 10–30 for tier-2 long-tail; 30–80k organic sessions/month; first lifestyle blog backlinks land.
- **6–12 months**: Top-10 rankings on locality + category combos in tier-1 cities; NYE seasonal hub captures large traffic spike; 100–300k organic sessions/month with a 2–4% organic→booking conversion target.

## Owner legend
- **eng** — frontend/backend implementation
- **content** — editorial, blog, on-page copy
- **ops** — partner onboarding, GBP guidance, offer verification
- **partner** — pub side: GBP, photos, replies to reviews
