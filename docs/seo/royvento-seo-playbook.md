# Royvento SEO Growth Playbook
*India-focused organic growth strategy for royvento.com — pub & event booking marketplace*

---

## Executive Summary (1-page, non-technical)

Royvento operates in one of the most underserved corners of Indian search: **pub and event-night booking**. Discovery today is fragmented — users juggle Instagram DMs, Magicpin, Zomato/District, Google Maps, and word-of-mouth — and no single brand owns the long-tail searches that actually convert ("rooftop pubs in Indiranagar", "ladies night Pune Saturday", "NYE 2026 Goa", "birthday party venues in Cyber Hub"). District (Zomato) and Paytm Insider dominate the head terms; LBB and Magicpin own the editorial layer. The gap between editorial discovery and a real booking is exactly where Royvento can plant its flag.

**The strategy in one paragraph.** We will (1) ship the technical SEO basics the SPA is missing today (per-route titles, schema, sitemaps, prerender for public pages, Core Web Vitals), (2) build a programmatic page system on top of our existing pubs/events/offers data — `city → locality → category → occasion` — so every realistic search query lands on a page that can both rank and convert, (3) feed those pages with a 12-week editorial calendar tied to the Indian nightlife calendar (NYE, IPL, Holi, Diwali, college-fest season), (4) make every partner pub a local-SEO asset by getting them GBP-ready, and (5) earn links by publishing original Royvento booking-data reports that lifestyle press (LBB, Curly Tales, Whats Hot) will quote.

**What "winning" looks like in 12 months.** Royvento ranks top-10 on most tier-1 city × locality × category combos ("rooftop pubs in Bandra", "microbreweries in Koregaon Park"), owns the brand SERP with knowledge panel + sitelinks, captures the NYE seasonal spike, and converts 2–4% of organic traffic into bookings. Realistic range: 100–300k organic sessions/month by month 12.

**Investment shape.** ~3 weeks of focused engineering for the technical foundation, ~6–8 weeks for the programmatic system, and a sustained 2-posts-per-week editorial cadence with light partner content help. No paid spend required for any of this to work.

**Why now.** District is busy reorganizing post-Zomato acquisition; BookMyShow/Insider are moving up-market into ticketed events and away from "table-for-4-on-Saturday" intent; Magicpin is offer-led and weak on event detail. The bookable-experience SERP in Indian nightlife is winnable in the next 12 months — after that, expect competitors to move in.

---

## 0. Current State Audit (codebase findings)

A read-only audit of `artifacts/royvento` (the user-facing React + Vite app) and `artifacts/api-server` (Express API) surfaced the following baseline. **Every recommendation in this playbook maps to one of these existing surfaces** so engineering can scope it directly.

### Existing public page templates (`artifacts/royvento/src/pages/`)
| Template | Route | File | Currently indexable? |
|----------|-------|------|----------------------|
| Home | `/` | `home.tsx` | SPA-rendered, no per-route meta |
| Explore | `/explore` | `explore.tsx` | SPA-rendered |
| Pubs list | `/pubs` | `pubs.tsx` | SPA-rendered |
| Pub offers | `/pub-offers` (alias `/hot-deals`) | `pub-offers.tsx` | SPA-rendered |
| Vendors list | `/vendors` (alias `/partners`) | `vendors.tsx` | SPA-rendered |
| Event detail | `/events/:id` | `event-detail.tsx` | SPA-rendered, ID-based slug |
| Vendor (pub) detail | `/vendors/:id` (alias `/partners/:id`) | `vendor-detail.tsx` | SPA-rendered, ID-based slug |
| Blogs hub | `/blogs` (alias `/blog`) | `blogs.tsx` | SPA-rendered |
| Blog post | `/blogs/:slug` | `blog-detail.tsx` | SPA-rendered, slug-based ✅ |
| Contact | `/contact` | `contact.tsx` | SPA-rendered |
| Subscription | `/subscription` (alias `/premium`) | `subscription.tsx` | SPA-rendered |
| Terms / Privacy | `/terms`, `/privacy` | `terms.tsx`, `privacy.tsx` | SPA-rendered |
| Auth & dashboard | `/login`, `/register`, `/profile`, `/dashboard/*`, `/admin`, `/wishlist`, `/notifications`, `/payment-result` | various | Should be `noindex` — currently aren't |

### What's missing (the SEO gaps)
- **No per-route meta or canonical**. `index.html` ships a single static `<title>Royvento — Event Management Platform</title>` and no description; no `react-helmet-async` or equivalent. Every page reports the same title to crawlers and social previews.
- **No schema.org / JSON-LD anywhere** (verified by repo-wide search for `application/ld+json`, `schema.org`).
- **No `sitemap.xml`, no `robots.txt`** in `artifacts/royvento/public/`.
- **No prerender / SSR**. Vite SPA only — Googlebot will JS-render but it slows discovery and AI crawlers (GPTBot, PerplexityBot) often miss content.
- **ID-based detail slugs** (`/vendors/12`, `/events/45`) — no keywords in URL, no city/locality.
- **No city, locality, category, or occasion templates** despite the data existing in the DB (vendors carry `city`, `state`, `country`; events carry categories).
- **OG image is generic** (`public/opengraph.jpg`); no per-template OG generation.
- **Auth/dashboard pages aren't `noindex`** — risk of internal pages leaking into the index.
- **No prerender of pub/event JSON-LD into HTML** means rich results (especially `Event` and `LocalBusiness`) are unlikely to fire.

### What's already good
- Clean, semantic URL structure for blogs (slug-based).
- 301 redirects for legacy paths (`/hot-deals → /pub-offers`, `/blog → /blogs`, `/premium → /subscription`) — re-use this pattern when migrating to slugged pub/event URLs.
- The codebase has a clear data layer (`@workspace/api-client-react`, OpenAPI-driven) — generating sitemaps from real DB data is straightforward.
- Existing service worker (`public/sw.js`) and PWA hooks — useful for Core Web Vitals and re-engagement, not directly SEO.
- Existing `i18n` directory — sets up future hreflang work cleanly.

---

## 1. Keyword Research

> Full keyword bank: **`docs/seo/keywords.csv`** (intent, page type, priority tier, est. difficulty, notes).

The bank is segmented by **page type** so each row maps to the page template that should rank for it:

| Bucket | Examples | Page template that owns it |
|--------|----------|----------------------------|
| **Brand** | royvento, royvento app, royvento book pub | Homepage |
| **Homepage / category-defining** | book a pub online india, pub booking app india, nightlife booking app | Homepage |
| **City** | best pubs in bangalore, best pubs in goa, best pubs in chandigarh | `/{city}` city hub (new) |
| **Locality** | pubs in indiranagar bangalore, pubs in cyber hub gurgaon, pubs in koregaon park pune | `/{city}/{locality}` (new) |
| **Category × city** | rooftop pubs in bangalore, microbreweries in pune, sports bar mumbai, couple friendly pubs bangalore, live music pubs bangalore | `/{city}/{category}` (new) |
| **Day / time modifiers** | ladies night bangalore, saturday dj night bangalore, sunday brunch pubs bangalore, happy hours pubs mumbai | Category page with day-filter; or separate occasion variant |
| **Occasion / programmatic** | birthday party venues in bangalore, corporate event venues bangalore, bachelor party venues bangalore, anniversary dinner pubs bangalore | `/pub-offers/{occasion}-{city}` or `/{city}/{occasion}` |
| **Seasonal** | new year party {city} 2026, christmas party venues bangalore, holi party pune, diwali party venues mumbai, ipl screening pubs bangalore, valentines day pubs bangalore, halloween party bangalore, monsoon offers pubs | Seasonal hub, refreshed annually |
| **Offer** | pub offers today in {city}, unlimited drinks pubs bangalore, happy hours pubs bangalore, free entry for ladies bangalore, free entry pubs bangalore | `/pub-offers` filtered, or `/pub-offers/{offer-type}-{city}` |
| **Pub-specific (long-tail brand)** | {pub name} {city} booking, {pub name} reviews | Vendor detail page |
| **Informational / blog** | how to plan a birthday party at a pub, nightlife guide bangalore, what is a microbrewery, royvento vs district by zomato | Blog hub + posts |
| **Partner acquisition** | become a partner pub on royvento, list your pub online india | Partner landing (new lightweight page) |

**India-specific notes baked into the bank**
- Tier-1 cities are quick-win on **city** terms but medium-difficulty on **city + category** because of competing editorial sites (LBB, MetroSaga). Long-tail wins faster than head.
- "Near me" terms are GBP-driven, not on-page driven — tackle via partner GBP onboarding (see §4), not by adding "near me" to titles.
- **Dry-day / alcohol legality varies by state**. Gujarat and Bihar are dry; Kerala has restrictions; Maharashtra requires liquor permits. Mark Ahmedabad/Surat/Patna keywords as "informational only" (e.g. "non-alcoholic party venues Ahmedabad") — don't promise alcohol service.
- Goa is **disproportionately important** Oct–Jan because of tourism + NYE; treat it as a tier-1 city for content priority despite being smaller.
- College-town keywords (Manipal, Vellore, BITS Pilani-Goa) are low competition and convert well — add to tier-2 expansion.

---

## 2. Site Architecture

### Recommended hierarchy
```
royvento.com
├── /                                 (Home — brand + city picker + featured offers)
├── /pubs                             (All pubs index — filterable; canonical for facets points here)
├── /events                           (All events index — new; currently only detail exists)
├── /pub-offers                       (Offers index — alias /hot-deals 301)
├── /blogs                            (Blog hub) → /blogs/{slug}
├── /partners                         (Partner acquisition landing — separate from /vendors list)
│
├── /{city}                           e.g. /bangalore  (City hub)
│   ├── /{city}/{locality}            e.g. /bangalore/indiranagar
│   │   └── /{city}/{locality}/{slug}-{id}   (Pub detail — locality-scoped)
│   ├── /{city}/{category}            e.g. /bangalore/rooftop, /bangalore/microbrewery
│   ├── /{city}/{occasion}            e.g. /bangalore/birthday-party-venues
│   └── /{city}/offers                (City-scoped offers)
│
├── /pubs/{city}/{slug}-{id}          (Canonical pub detail; old /vendors/:id 301 here)
├── /events/{city}/{slug}-{id}        (Canonical event detail; old /events/:id 301 here)
└── /pub-offers/{occasion}-{city}-{year?}  e.g. /pub-offers/nye-bangalore-2026
```

### Slug conventions
- **Lowercase, hyphenated, ASCII-only** (transliterate Devanagari etc. for URLs; keep original in H1 and meta).
- **City / locality**: official spelling, no abbreviations (`bengaluru` is fine but pick **one** — recommendation: use `bangalore` because search volume is higher; canonicalize `bengaluru` → `bangalore` via 301).
- **Pub slug**: `{pub-name}-{locality}` (e.g. `toit-indiranagar`). Append numeric `-{id}` to prevent collisions and keep slugs stable when names change.
- **Event slug**: `{event-name}-{date-yyyy-mm-dd}` so recurring events don't conflict.
- **Occasion slug**: `nye`, `christmas`, `valentines`, `halloween`, `holi`, `diwali`, `birthday-party-venues`, `corporate-event-venues`.

### Internal-linking rules
1. **Home** → all city hubs (top 12 in nav, full list in footer); featured offers; latest 6 blogs.
2. **City hub** → all localities in that city; all categories in that city; top 10 pubs; top 6 offers; 3–5 city blogs.
3. **Locality page** → its city hub (parent), other localities (siblings), pubs in that locality, related categories.
4. **Category page** → its city hub, other category pages in same city (`also see: rooftop, sports bar`), top pubs in that category.
5. **Pub detail** → city hub, locality page, category pages it belongs to, 4–6 similar pubs in same locality.
6. **Event detail** → host pub detail, city hub, related upcoming events.
7. **Offer page** → the pub offering it, the offer category page, the city offers index.
8. **Blog post** → at least one city, one locality/category, one specific pub or event (the "Related reads" + "Book a table" rails referenced in the calendar).

### Hierarchy diagram (textual)
```
Home
 ├── City: Bangalore ──┬── Locality: Indiranagar ──── Pub: Toit Indiranagar
 │                     │                          └── Pub: The Black Rabbit
 │                     ├── Locality: Koramangala
 │                     ├── Category: Rooftop ──────── Pubs filtered to rooftop+blr
 │                     ├── Category: Microbrewery
 │                     ├── Occasion: Birthday Venues
 │                     └── Offers: Bangalore
 ├── City: Mumbai (same shape)
 ├── City: Delhi (same shape)
 └── ... 12 tier-1/2 cities live at launch, 30+ within 6 months
```

---

## 3. On-Page SEO Templates

For each template: **title, meta description, slug, H1/H2 structure, ALT pattern, schema, internal-link checklist, and 2 worked examples.**

### 3.1 Home (`/`)

- **Title**: `Book a Pub Table or Party in India | Royvento`  *(≤60 chars)*
- **Meta**: `Discover and book pubs, parties, and events across India — from rooftop bars in Bandra to microbreweries in Indiranagar. Free entry deals, instant table booking, verified partners.`  *(≤155 chars)*
- **Slug**: `/`
- **H1**: `Book Pubs, Parties & Events Across India`
- **H2 / sections**: City picker · Tonight's offers · Top categories (Rooftop, Microbrewery, Sports Bar, Live Music, Couple-Friendly) · How Royvento works · Featured partners · Latest blogs.
- **ALT pattern**: `Royvento — book {pub} in {city}` for hero cards.
- **Schema**: `Organization`, `WebSite` (with `SearchAction` → `/explore?search={query}`), `BreadcrumbList`.
- **Internal links checklist**: All city hubs in nav; 12 cities + "View all" in footer; featured offers; 4 latest blogs.
- **Example 1 — title test**: `Book a Pub Table or Party in India | Royvento` → if CTR low, A/B with `Pub Booking, Parties & Nightlife in India | Royvento`.

### 3.2 City hub (`/{city}`)

- **Title**: `{Best Pubs in {City}} — Book a Table | Royvento`
- **Meta**: `{N}+ pubs and party venues in {City} — rooftop bars, microbreweries, live music, couple-friendly. Today's offers, ladies nights, NYE parties — instant booking on Royvento.`
- **Slug**: `/{city}` (e.g. `/bangalore`)
- **H1**: `Best Pubs in {City} — Book a Table Tonight`
- **H2**: Top 10 pubs · Localities · Categories (Rooftop, Microbrewery, Sports Bar, Live Music, Couple-Friendly) · This week's offers · Upcoming events · Frequently asked questions
- **ALT pattern**: `{Pub} — {category} in {locality}, {city}`
- **Schema**: `BreadcrumbList`, `ItemList` of pubs (each as `BarOrPub`), `FAQPage`, `CollectionPage`.
- **Internal links**: All locality pages, all category pages, top 10 pub details, top 6 offers, 3 city blogs, parent breadcrumb to home.
- **Example 1 — Bangalore**:
  - Title: `Best Pubs in Bangalore — Book a Table | Royvento`
  - H1: `Best Pubs in Bangalore — Book a Table Tonight`
  - FAQs: "Which area in Bangalore has the best pubs?" · "What's the legal drinking age in Bangalore?" · "Are there ladies' nights in Bangalore?"
- **Example 2 — Goa** (NYE-skewed):
  - Title: `Best Pubs & Beach Clubs in Goa — Book Now | Royvento`
  - Add a sticky NYE banner Oct–Dec linking to `/pub-offers/nye-goa-2026`.

### 3.3 Locality page (`/{city}/{locality}`)

- **Title**: `Best Pubs in {Locality}, {City} — Book Online | Royvento`
- **Meta**: `Top pubs in {Locality}, {City} with instant table booking, ladies' nights, happy hours and NYE/IPL parties. {N} verified pubs on Royvento.`
- **Slug**: `/{city}/{locality}` (e.g. `/bangalore/indiranagar`)
- **H1**: `Best Pubs in {Locality}, {City}`
- **H2**: Top picks in {Locality} · Cuisines & vibes · Offers in {Locality} this week · How to reach {Locality} · FAQs
- **Schema**: `BreadcrumbList`, `ItemList` of `BarOrPub`, `FAQPage`, optional `Place` for the locality itself.
- **Worked example — Indiranagar, Bangalore**:
  - Title: `Best Pubs in Indiranagar, Bangalore — Book Online | Royvento`
  - H1: `Best Pubs in Indiranagar, Bangalore`
  - FAQs: "Which is the most famous pub in Indiranagar?" · "What's the cover charge in Indiranagar pubs?" · "Where can I park near Indiranagar pubs?"
- **Worked example — Cyber Hub, Gurgaon**:
  - Title: `Best Pubs in Cyber Hub, Gurgaon — Book a Table | Royvento`
  - H1: `Best Pubs in Cyber Hub, Gurgaon`
  - Add corporate-friendly upsell: "Planning an office party? See [corporate venues in Gurgaon](/gurgaon/corporate-event-venues)."

### 3.4 Category page (`/{city}/{category}`)

- **Title**: `{Category} in {City} — Book a Table | Royvento`
- **Meta**: `{N} {category} venues in {City} with instant booking, prices, photos and offers. Updated weekly on Royvento.`
- **Slug**: `/{city}/{category}` (e.g. `/bangalore/rooftop`, `/pune/microbrewery`)
- **H1**: `{N} Best {Category} {Pubs/Bars/Venues} in {City}`
- **H2**: What makes a great {category} · Top {category} picks · Offers · Localities to find {category} in {City} · FAQs
- **Schema**: `BreadcrumbList`, `ItemList`, `FAQPage`.
- **Worked example — Rooftop in Mumbai**:
  - Title: `Rooftop Bars in Mumbai — Book a Table | Royvento`
  - H1: `15 Best Rooftop Bars in Mumbai`
  - Internal links to Bandra, Lower Parel, Juhu locality pages.
- **Worked example — Microbreweries in Bangalore**:
  - Title: `Microbreweries in Bangalore — Book Online | Royvento`
  - H1: `12 Best Microbreweries in Bangalore`
  - Cross-link: "See also: [Microbreweries in Pune](/pune/microbrewery), [Microbreweries in Gurgaon](/gurgaon/microbrewery)."

### 3.5 Occasion / programmatic (`/{city}/{occasion}` or `/pub-offers/{occasion}-{city}-{year}`)

- **Title (seasonal)**: `{Occasion} {Year} in {City} — Best Parties & Venues | Royvento`
- **Title (evergreen)**: `{Occasion} Venues in {City} — Book Online | Royvento`
- **Meta**: `Plan your {occasion} in {City}: {N} verified pubs and venues, current offers, prices and instant booking on Royvento.`
- **Slug**: `/{city}/birthday-party-venues`, `/{city}/corporate-event-venues`, `/pub-offers/nye-bangalore-2026`
- **H1**: `{Occasion} Venues in {City}` (or `{Occasion} {Year}: {City}'s Best Parties`)
- **H2**: This year's top {occasion} venues · What to budget · How to book · FAQs · Related cities
- **Schema**: `BreadcrumbList`, `ItemList`, `FAQPage`. For seasonal hubs, also `Event` schema for each listed party (with `eventStatus`, `eventAttendanceMode`, `offers`).
- **Worked example — Birthday venues in Bangalore (evergreen)**:
  - Title: `Birthday Party Venues in Bangalore — Book Online | Royvento`
  - H1: `Best Birthday Party Venues in Bangalore`
  - FAQs: "How to plan a surprise birthday at a pub?" · "What's the minimum budget for a birthday at a Bangalore pub?" · "Can pubs arrange cake-cutting?"
- **Worked example — NYE 2026 in Goa (seasonal)**:
  - Title: `NYE 2026 in Goa — Best New Year Parties | Royvento`
  - H1: `New Year's Eve 2026 in Goa — Verified Parties`
  - Refresh annually in October; same URL is fine for `nye-goa-{year}` if year is in slug; otherwise use `/goa/nye` and update content yearly.

### 3.6 Pub detail (`/pubs/{city}/{slug}-{id}`)

- **Title**: `{Pub Name}, {Locality} {City} — Book a Table | Royvento`
- **Meta**: `Book a table at {Pub Name}, {Locality}, {City}. {Vibe/category}, {price for two} avg, {top offer}. Verified by Royvento.`
- **Slug**: `/pubs/{city}/{pub-slug}-{id}` (301 from `/vendors/{id}`)
- **H1**: `{Pub Name} — {Category} in {Locality}, {City}`
- **H2**: About · Menu & drink plans · Offers · Photos · Reviews · Location & timings · Similar pubs · FAQs
- **ALT pattern**: `{Pub Name} {locality} {city} — {photo subject}`
- **Schema**: `BarOrPub` (or `Restaurant` when relevant) with `address`, `geo`, `openingHoursSpecification`, `priceRange`, `servesCuisine`, `hasMenu`, `aggregateRating`, `review`. Plus `BreadcrumbList`, `Offer` for active deals.
- **Internal links**: city, locality, every category it belongs to, 4–6 similar pubs in same locality.
- **Worked example — Toit, Indiranagar**:
  - Title: `Toit, Indiranagar Bangalore — Book a Table | Royvento`
  - H1: `Toit — Microbrewery in Indiranagar, Bangalore`
- **Worked example — Aer, Worli (rooftop)**:
  - Title: `Aer, Worli Mumbai — Rooftop Bar Booking | Royvento`
  - H1: `Aer — Rooftop Bar in Worli, Mumbai`

### 3.7 Event detail (`/events/{city}/{slug}-{id}`)

- **Title**: `{Event Name} — {Pub} {City}, {Date} | Royvento`
- **Meta**: `Book {event name} at {pub}, {city} on {date}. {Cover/free-entry summary}, line-up, table options. Instant booking on Royvento.`
- **Slug**: `/events/{city}/{event-slug}-{date}-{id}` (301 from `/events/{id}`)
- **H1**: `{Event Name} — {Pub}, {City}`
- **H2**: Date & time · Line-up · Tickets & tables · Offers · Venue · FAQs · Similar events
- **Schema**: `Event` (`eventStatus`, `eventAttendanceMode`, `location`, `performer` if applicable, `offers` with price/availability/url), `BreadcrumbList`.
- **Worked example — Saturday DJ Night**:
  - Title: `Saturday DJ Night — Skyye Lounge UB City, Bangalore, 23 Aug | Royvento`
  - H1: `Saturday DJ Night — Skyye Lounge, Bangalore`
- **Worked example — IPL Final Screening**:
  - Title: `IPL Final Screening — Toit, Bangalore, 30 May | Royvento`
  - H1: `IPL Final Screening — Toit, Indiranagar`

### 3.8 Offer page (`/pub-offers` and `/{city}/offers`)

- **Title (city-scoped)**: `Pub Offers in {City} Today — {N} Live Deals | Royvento`
- **Meta**: `{N} live pub offers in {City} — happy hours, ladies' nights, free entry, unlimited drinks. Updated daily on Royvento.`
- **H1**: `Pub Offers in {City} Today`
- **H2**: Tonight's offers · Ladies' night · Happy hours · Free entry · Couple offers · This weekend · FAQs
- **Schema**: `ItemList` of `Offer` (each linked to its `BarOrPub`).
- **Internal links**: each pub detail; the city hub; the offer category pages.

### 3.9 Blog post (`/blogs/{slug}`)

- **Title**: `{Article Title} | Royvento Blog`
- **Meta**: First-150-chars hook with the primary keyword + a CTA verb.
- **H1**: `{Article Title}` (one only).
- **H2/H3**: Logical, scannable; include FAQ block at the end.
- **ALT**: descriptive, locality + subject.
- **Schema**: `BlogPosting` (`author`, `datePublished`, `dateModified`, `image`), `BreadcrumbList`, `FAQPage` for the FAQ section.
- **Internal links**: 3+ outgoing — city hub, locality/category, specific pub/event. Plus a "Book a table" rail.

---

## 4. Local SEO

### Why this matters disproportionately for Royvento
Most pub searches are local-intent ("near me", "in {locality}", on Google Maps). Maps rankings are GBP-driven, not on-page-driven. Royvento's competitive moat partly comes from **making every partner pub a local-SEO winner** — that's a tangible reason for pubs to onboard.

### Partner GBP onboarding checklist (ship as a 1-pager to vendors during onboarding)

**Profile completeness**
- [ ] Claim and verify the GBP listing (postcard or video verify).
- [ ] Use the **exact** legal/trading name — no city/keyword stuffing in the name (Google penalizes it).
- [ ] Primary category: `Bar`, `Pub`, `Brewpub`, `Sports bar`, `Cocktail bar`, `Lounge`, `Restaurant` — pick the most specific.
- [ ] Add 3–5 relevant secondary categories.
- [ ] NAP consistency: name, address, phone must match exactly across GBP, Royvento, Zomato, Magicpin, JustDial, EazyDiner, website, Facebook, Instagram bio.
- [ ] Service area / neighbourhood field set to the locality.

**Hours, attributes, services**
- [ ] Regular hours + special hours for festivals (Diwali, Holi, NYE, Eid, dry days).
- [ ] Attributes: outdoor seating, rooftop, live music, dance floor, wheelchair accessible, free Wi-Fi, accepts reservations, accepts UPI/cards.
- [ ] Add menu link (Royvento page works as the menu/booking link).
- [ ] Add reservations link → Royvento pub detail page.

**Photos & posts**
- [ ] At least 25 photos at launch (cover, logo, interior, exterior at night, food, drinks, crowd shot — get model release).
- [ ] Add a Google Post weekly (offer of the week, ladies' night reminder, NYE booking open).
- [ ] Add 3+ short videos (15–30s, vertical).

**Reviews**
- [ ] Reply to every review within 48h (especially negative — calmly, never argumentative).
- [ ] Generate review velocity by SMS/WhatsApp follow-up to recent Royvento bookings (do **not** offer incentives — Google policy).

**Q&A**
- [ ] Seed the Q&A section with 6–10 real customer questions (entry policy, dress code, parking, valet, ladies' night day, smoking section).

### Local citation sources (India-specific)
Submit / claim consistent NAP on:
1. **Zomato / District by Zomato** (most important after GBP)
2. **Magicpin**
3. **EazyDiner**
4. **Dineout** (post Times Internet acquisition — still relevant in some cities)
5. **JustDial**
6. **Sulekha**
7. **AskLaila** (especially Bangalore/Hyderabad)
8. **TripAdvisor** (Goa, Mumbai, Delhi tourist demand)
9. **Lybrate / Burrp / Nearbuy** where the listing is free
10. **Apple Maps** via Apple Business Connect (for iPhone "near me")
11. **Bing Places**
12. **Facebook Page + Instagram business profile + Foursquare**

### "Near me" optimization patterns (without keyword-stuffing)
- Don't put "pubs near me" in titles — it's an ungrammatical user formulation. Instead, win it via:
  - Strong GBP signals on partner pubs (above).
  - On-page proximity signals: city + locality in H1, address with `geo` schema, openingHours, "How to reach us" section, embedded map, postal code in footer of detail pages.
  - Internal-linking density between locality pages and pub detail (Google uses this to understand local clusters).
- For Royvento's own pages (city hub), instead of "near me" use natural variants like "tonight in {city}", "this weekend in {city}", "open now in {locality}".

### Maps ranking checklist (for partners to action)
1. Verified GBP with consistent NAP.
2. Highest-volume primary category, accurate secondary categories.
3. ≥40 reviews with ≥4.0 rating, replies on all of them.
4. Photos uploaded weekly.
5. Posts published weekly.
6. Citations on top 6 directories above.
7. Backlink from Royvento pub detail page (high-authority hub for the niche).
8. Q&A seeded with locality terms.

---

## 5. Technical SEO

### React + Vite SPA — the realistic Googlebot story
Googlebot will JS-render most modern SPAs, but: (a) it's slower (days vs hours to discovery), (b) social previews and GPT/Perplexity crawlers often don't execute JS at all, and (c) `Event` and `LocalBusiness` rich results are flaky when the schema is injected post-hydration.

**Recommendation**: prerender or SSR the indexable surface — home, city, locality, category, occasion, pub, event, offer, blog. Keep dashboards/auth as pure SPA. Two viable paths:

1. **react-snap / rendertron-style prerender at build time**, then per-route revalidation through a serverless worker for dynamic data (pub/event lists). Lightest lift; works inside the existing Vite pipeline.
2. **Vite SSR** for public routes only (`/`, `/{city}`, `/{city}/{locality}`, `/{city}/{category}`, `/pubs/...`, `/events/...`, `/blogs/...`). Cleanest long-term, more refactor work.

If neither lands soon, a stop-gap is to inject the critical SEO tags (title, meta, canonical, JSON-LD, OG) into the initial HTML at the edge based on the URL — this captures most of the value without full SSR.

### Core Web Vitals (current SPA, action list)
- **LCP** (target <2.5s)
  - Defer non-critical JS; route-split heavy pages (`vendor-dashboard`, `admin`, `subscription`, `blogs`, `blog-detail` are already lazy — good).
  - Inline critical CSS for `/`, `/{city}`, `/pubs/...` — Tailwind purge already strips unused; add `vite-plugin-critical` for above-the-fold.
  - Hero image: `<img fetchpriority="high" loading="eager" decoding="sync">` plus `srcset` AVIF/WebP.
  - Preconnect: `fonts.googleapis.com`, `fonts.gstatic.com`, image CDN host.
  - Move Google Fonts to self-host or `display=swap` (already in use).
- **INP** (target <200ms)
  - Avoid heavy synchronous work on click (the booking modal in `event-detail.tsx` should defer heavy form-state hydration).
  - Debounce search inputs in `/explore` and city pages.
- **CLS** (target <0.1)
  - Fixed `width`/`height` (or `aspect-ratio`) on all `<img>` in pub/event cards.
  - Reserve space for the sticky "Book a Table" CTA.
  - Don't insert ad/coupon banners after first paint.

### Mobile optimization
- Royvento's audience is overwhelmingly mobile. Verify viewport meta (already correct in `index.html`).
- Sticky bottom CTA: "Book a Table" on pub detail, "Book Now" on event detail (mobile only, hide above 768px).
- Tap targets ≥44×44 CSS px.
- Avoid intrusive interstitials (especially the location prompt) — Google penalizes mobile interstitials.

### Image strategy
- Migrate to an image CDN (Cloudflare Images, Imgix, or Bunny Optimizer) with on-the-fly resizing.
- Serve AVIF first, WebP fallback, JPEG fallback.
- `srcset` with 2–3 widths (e.g. 480, 768, 1200).
- Lazy-load all below-the-fold (`loading="lazy" decoding="async"`).
- Strip EXIF; pre-rotate to landscape; max 200KB above-the-fold.

### Sitemap strategy
Generate dynamically from the API (Express route), don't try to ship as a static file. **Split** so a single sitemap never exceeds 50k URLs / 50MB:
- `/sitemap-index.xml` — references the below.
- `/sitemap-static.xml` — home, /pubs, /pub-offers, /vendors, /blogs, /contact, /terms, /privacy, /subscription, /partners.
- `/sitemap-cities.xml` — all city + locality + category + occasion pages.
- `/sitemap-pubs.xml` — every public pub detail.
- `/sitemap-events.xml` — every published event with `lastmod`.
- `/sitemap-offers.xml` — active offers.
- `/sitemap-blogs.xml` — all blog posts.
Set `<changefreq>` and `<priority>` honestly (don't set everything to 1.0). Submit `/sitemap-index.xml` to GSC + Bing Webmaster.

### `robots.txt`
```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /profile
Disallow: /wishlist
Disallow: /notifications
Disallow: /payment-result
Disallow: /reset-password
Disallow: /forgot-password
Disallow: /*?*sort=
Disallow: /*?*page=
Allow: /sitemap-index.xml

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

Sitemap: https://royvento.com/sitemap-index.xml
```
(Block AI crawlers only if you specifically don't want to be cited — Royvento should be cited; allow them.)

### Canonical & pagination
- Every page has a self-referencing canonical.
- Filtered pubs/events pages canonical back to the unfiltered template (e.g. `/pubs?city=bangalore&category=rooftop` canonical → `/bangalore/rooftop`).
- Paginated lists: use `<link rel="next" / "prev">` and don't `noindex` page 2+ unless content is truly thin.

### Structured-data validation
- After every schema addition, validate via [validator.schema.org](https://validator.schema.org/) + Google Rich Results Test for `Event`, `LocalBusiness`, `BreadcrumbList`, `FAQPage`, `BlogPosting`, `Review`, `Offer`.
- Set up a CI check that fails if a sample of generated pages doesn't pass the validator (lightweight Vitest hitting the rendered HTML).

### Crawl-budget tips
- Faceted filters generate near-infinite combinations (`?city=...&category=...&day=...`). Do **one** of:
  - Convert promoted facets to clean URLs (`/{city}/{category}`) and 301/canonical the query versions.
  - `noindex` non-promoted facet combinations.
  - Block facet patterns in robots.txt for query strings we don't want crawled.
- Don't paginate beyond 10 pages on a single template — surface "see more pubs in {city}" via city/locality navigation instead.
- Use 410 (gone) — not 404 — when an event is permanently past and removed.

---

## 6. Content SEO — 40+ blog ideas

Tagged by `target keyword` and `funnel stage` (TOF = top, MOF = middle, BOF = bottom). All link back to programmatic / city pages.

### Pillar guides (TOF)
1. **Nightlife Guide to Bangalore** — `nightlife guide bangalore` (TOF)
2. **Nightlife Guide to Mumbai** — `nightlife guide mumbai` (TOF)
3. **Nightlife Guide to Delhi NCR** — `nightlife guide delhi ncr` (TOF)
4. **Nightlife Guide to Goa** — `nightlife guide goa` (TOF)
5. **Nightlife Guide to Pune** — `nightlife guide pune` (TOF)
6. **Nightlife Guide to Hyderabad** — `nightlife guide hyderabad` (TOF)
7. **Craft Beer Guide India** — `craft beer guide india` (TOF)
8. **What is a Microbrewery? (and the 12 best in India)** — `what is a microbrewery` (TOF)

### City roundups & comparisons (MOF)
9. **15 Best Rooftop Pubs in Mumbai** — `rooftop bars in mumbai` (MOF)
10. **12 Microbreweries in Bangalore Worth Booking This Weekend** — `microbreweries in bangalore` (MOF)
11. **Cyber Hub vs Sector 29: Where Should You Party in Gurgaon?** — `pubs in cyber hub gurgaon` (MOF)
12. **Indiranagar vs Koramangala: Bangalore's Pub Streets Compared** — `pubs in indiranagar bangalore` (MOF)
13. **Park Street, Kolkata: A Pub Crawl Itinerary** — `pubs in kolkata park street` (MOF)
14. **Bandra vs Lower Parel: Mumbai Rooftop Faceoff** — `rooftop bars in mumbai` (MOF)
15. **HKV vs CP: Where to Party in Delhi Tonight** — `pubs in hauz khas village delhi` (MOF)
16. **Koregaon Park, Pune: The Complete Nightlife Map** — `pubs in koregaon park pune` (MOF)
17. **Best Couple-Friendly Pubs in Bangalore for Date Night** — `couple friendly pubs bangalore` (MOF)
18. **Best Sports Bars in Bangalore for IPL & Premier League** — `sports bar bangalore` (MOF)
19. **10 Best Live Music Pubs in Bangalore** — `live music pubs bangalore` (MOF)
20. **Karaoke Bars in Bangalore Where You Won't Get Booed** — `karaoke bars in bangalore` (MOF)

### Occasion / planning guides (BOF — high commercial intent)
21. **How to Plan a Surprise Birthday Party at a Pub in Bangalore** — `surprise birthday venues bangalore` (BOF)
22. **How to Book a Bachelorette Night Out in Mumbai** — `bachelorette party places mumbai` (BOF)
23. **How to Plan a Corporate Offsite in Bangalore (Pubs Edition)** — `corporate event venues bangalore` (BOF)
24. **The Best Anniversary Dinner Pubs in Bangalore** — `anniversary dinner pubs bangalore` (BOF)
25. **How Royvento Pub Booking Works (and Why You Get Free Entry)** — `how does pub table booking work` (BOF/brand bridge)
26. **Royvento vs District by Zomato: A Realistic Comparison** — `royvento vs district by zomato` (BOF)
27. **Royvento vs Paytm Insider: When to Use Which** — `royvento vs paytm insider` (BOF)

### Seasonal / always-relevant (refresh annually)
28. **NYE 2026 in Goa: Where to Book Now Before It Sells Out** — `new year party goa 2026` (BOF, seasonal)
29. **NYE 2026 in Bangalore: 20 Verified Parties** — `new year party bangalore 2026` (BOF, seasonal)
30. **NYE 2026 in Mumbai: City Picks** — `new year party mumbai 2026` (BOF, seasonal)
31. **Christmas Eve & Day Party Venues in Bangalore** — `christmas party venues bangalore` (MOF, seasonal)
32. **IPL Watch Party Pubs in Bangalore** — `ipl screening pubs bangalore` (MOF, seasonal)
33. **Holi Party Guide for Pune** — `holi party pune` (MOF, seasonal)
34. **Diwali Week: Pub Parties That Aren't Family Lunches** — `diwali party venues mumbai` (MOF, seasonal)
35. **Halloween Parties in India 2026** — `halloween party bangalore` (MOF, seasonal)
36. **Valentine's Day: Couple Pubs in Bangalore** — `valentines day couple dinner bangalore` (BOF, seasonal)
37. **Monsoon Pub Offers in Mumbai (Indoor Vibes Edition)** — `monsoon offers pubs mumbai` (MOF, seasonal)

### Trends & lifestyle (link bait)
38. **India Nightlife Report 2026: Royvento Booking Data** — original-data PR (TOF, link bait)
39. **What to Wear to a Pub Night Out (City-by-City Dress Codes)** — `pub dress code india` (TOF)
40. **Average Cost of a Night Out in Bangalore (vs Mumbai vs Delhi)** — `cost of night out bangalore` (TOF)
41. **The Rise of Microbreweries in India** — `craft beer india` (TOF)
42. **Best Time to Book a Pub for New Year's Eve** — `when to book nye party` (MOF)

> See **`docs/seo/content-calendar.md`** for the 12-week publishing schedule that turns these ideas into a sequenced plan.

---

## 7. Programmatic SEO

### Templates and the data they need

| Template | URL pattern | DB inputs needed | Indexability rule |
|----------|-------------|------------------|-------------------|
| City hub | `/{city}` | `vendors.city` count ≥ 6, ≥3 categories represented, ≥3 localities | Index |
| Locality | `/{city}/{locality}` | `vendors` with locality tag, ≥4 pubs in locality | Index if ≥4 pubs; else `noindex` + parent canonical |
| Category × city | `/{city}/{category}` | `vendors` tagged with category in city, ≥4 pubs | Index if ≥4 pubs |
| Occasion × city (evergreen) | `/{city}/{occasion}` | Curated list of pubs that host this occasion (admin-tagged), ≥6 pubs | Index if ≥6 pubs |
| Seasonal × city | `/pub-offers/{occasion}-{city}-{year}` | `events` with seasonal tag + dates, ≥6 events | Index if ≥6 events; remove from sitemap after season end + 60 days |
| Best-of-{city}-{day} | `/{city}/saturday-night`, `/{city}/sunday-brunch` | Events on that weekday + drink-plan tags | Index if ≥6 entries |
| City offers | `/{city}/offers` or `/pub-offers?city=` (canonicalize one) | Active offers in city | Index |
| Tonight-in-city (live) | `/{city}/tonight` | Open-now logic + offers ending ≤24h | `noindex, follow` (real-time, low SEO value but high UX value — keep crawlable but don't index) |

### Content blocks per programmatic page
Every programmatic template renders, in order:
1. **H1 with city/locality/category and intent verb** (Book / Find / Plan).
2. **Editorial intro paragraph** (≥120 words, hand-written **per city** at minimum — never per-locality, never auto-generated). Templated phrasing kills uniqueness; instead, define an editorial brief per city that the content team writes once and updates yearly.
3. **Top picks list** with 6–12 items (pub cards with photo, vibe, price-for-two, top offer, "Book a table" CTA).
4. **Filter rail** (price, vibe, day, offer type) — UX, not SEO.
5. **"Also in {city}"** internal-link block (other localities/categories).
6. **Editorial sub-section** (e.g. "What makes a good rooftop in Mumbai monsoon" — 100–200 words).
7. **FAQs** (6–10 per template; FAQPage schema; questions vary per locality — never cookie-cutter).
8. **Reviews highlight** (3–6 best recent reviews from the listed pubs, with attribution).
9. **Map** (interactive on city/locality pages).
10. **Breadcrumb** + footer.

### Dynamic vs. static parts
- **Dynamic** (live from DB, regenerated daily or on write): pub list, top offers, reviews highlight, photo collage.
- **Static** (admin-edited, per-page CMS-style): editorial intro, sub-section, FAQs, hero copy.
- Store the static parts in a small `seo_pages` table keyed on `(template, city, locality?, category?, occasion?)` — gives content team direct CMS control without an engineer in the loop.

### Indexing strategy
- Every programmatic page gets a self-canonical and is in the relevant sitemap shard.
- Pages failing the thin-content rule (e.g. fewer than the minimum pubs, or no editorial intro) are emitted with `noindex, follow` until they meet the bar.
- Add a content-health admin dashboard that lists every programmatic URL with: pub count, FAQ count, editorial-intro word count, last review date, indexable yes/no — so content can prioritize what to flesh out.

### Thin-content safeguards
- No template ships before the content team has filled in the editorial intro and FAQs for it.
- No city goes live with fewer than **6 verified pubs** — until then, redirect `/{city}` to `/explore?city=...` with a "Coming soon to {city}" hero.
- Auto-spawning 1500 city×locality pages with identical copy will earn a Helpful Content Update penalty fast — the `seo_pages` editorial gate is non-negotiable.
- A "duplicate detector" cron compares page bodies pairwise; >60% similarity flags for rewrite.

---

## 8. Conversion SEO — turn organic landings into bookings

### Above-the-fold (mobile-first)
- **Pub detail**: hero image (verified photo), pub name + locality, primary category badge, ★ rating + count, top offer in coloured pill, **sticky bottom CTA: "Book a Table"** with date+pax preset.
- **City/category landing**: city picker chip (already-set), one-line value prop, top 3 pubs as horizontal-scroll cards, "Book a table" on each card (no detail-page detour for the impatient user).

### Trust signals (everywhere on detail pages)
- "Verified by Royvento" badge with a short tooltip explaining what verification means (we visited / called / cross-checked GBP).
- "Instant confirmation" badge if the pub auto-approves bookings.
- Secure-payment lockup (PhonePe / UPI / cards).
- Refund / cancellation summary 1-liner with link to full policy.
- "X people booked here this week" (real number, no fake urgency).
- 3 most recent reviews previewed on detail pages.

### Social proof
- Reviews carousel above-the-fold on pub detail.
- Recent bookings ticker ("Aarav booked at Toit · 3 min ago") only if it's real.
- Press mentions strip on home (LBB, Curly Tales, etc.) once we have them.
- WhatsApp share button on every pub/event card — high virality in India.

### Sticky CTAs on mobile
- Pub detail: sticky "Book a Table" with date + party size.
- Event detail: sticky "Get Tickets" or "Reserve Table" depending on event type.
- Always show price next to CTA — never hide it behind a click.

### Exit-intent / re-engagement
- On mobile, intent is harder to detect — instead use **back-button hijack on pub detail**: when the user hits back without booking, slide up a one-tap "Save to Wishlist" + "Notify me of offers in {city}" prompt.
- Web push opt-in on second pageview (already supported in stack), not first.
- Exit-intent (desktop): "See similar pubs in {locality}" rail.

### Bounce-rate reducers
- Pre-fill the city from geolocation **with the user's permission and a fallback chip** — never silently force a city.
- Show "open now" badge prominently (state from DB, not client clock).
- Keep page weight under 1MB on city/locality pages — every 100KB beyond that costs measurable bounce on 3G/4G.

### KPI map (each recommendation ties to a measurable metric)
| Recommendation | Metric to watch | Target lift |
|----------------|-----------------|-------------|
| Sticky mobile CTA | Pub-detail → booking-start rate | +15–25% |
| Verified badge | Pub-detail bounce | -5–10% |
| Reviews above fold | Time-on-page | +20% |
| Real "X booked this week" | Click-to-book rate | +5–10% |
| Web-push on 2nd pageview | Push opt-in rate | 8–15% |
| Pre-set city + open-now | City-page bounce | -10–15% |
| Average page weight <1MB | LCP, INP | LCP <2.5s, INP <200ms |

---

## 9. Backlink Strategy — India-specific

### Tier-1 link targets (most leveraged for our niche)
- **LBB (Little Black Book)** — `lbb.in` — city editorial; pitch curated pub roundups they can republish with our data.
- **Curly Tales** — `curlytales.com` — lifestyle/food; pitch original-data pieces (Most-Booked Pub of 2026, NYE Report).
- **Whats Hot** — `whatshot.in` — city listicles; offer them our verified data feed.
- **Homegrown** — `homegrown.co.in` — youth/lifestyle; pitch trend pieces (microbrewery rise, college-fest after-parties).
- **MetroSaga** — `metrosaga.com` — Bangalore-heavy; locality guides.
- **Magicpin Blog** — `magicpin.in/blog` — partner-of-frenemy angle; co-marketing on offer trends.
- **EazyDiner Blog** — same as above for fine-dining/cocktail bars.
- **The Better India** — `thebetterindia.com` — partner-stories angle ("How Royvento helps independent pubs").
- **Scoopwhoop / Buzzfeed India** — listicle-friendly seasonal content.

### Tier-2 link targets
- City lifestyle Instagram pages with blog tie-ins (e.g. @bangaloreinsider, @whatsuplife, @mumbaifoodie blogs).
- College fest sponsorships → backlink from fest microsites (Mood Indigo, Saarang, Rendezvous, Strawberry Fields, NLS Spiritus).
- Local newspapers' lifestyle sections (Bangalore Mirror, Mumbai Mirror, Hindustan Times Brunch, TOI City supplements).

### PR angles that earn links
1. **Year-end nightlife report**: "India's Most-Booked Pubs of 2026" with city-wise leaderboards (Royvento booking data).
2. **NYE Report**: "Most expensive vs most affordable NYE party by city" — annually.
3. **Seasonal data drops**: "IPL Final night: which city drank the most beer?", "Holi: India's biggest pub party cities".
4. **Trend angles**: "Rise of Sober October", "Microbreweries grew Xx in tier-2 cities".
5. **Awards**: "Royvento Partner of the Year" by city — pubs share the win on socials → links + UGC.

### Outreach email template (reusable)
```
Subject: Free dataset for {Publication}: India's most-booked {pubs|NYE parties|microbreweries} of 2026

Hi {Name},

I'm {You} from Royvento — we run pub & event booking across {N} Indian cities. Each {month/quarter} we publish booking-trend data we've never seen anyone else cover at this granularity (e.g. which {locality} in {city} grew fastest in 2026, average cover charge by city, ladies'-night booking volume by weekday).

For your {next city guide / NYE coverage / weekend roundup}, would a clean exclusive dataset help? Happy to send a tailored cut for {Publication}'s audience — and we're fine with a citation-style link rather than a sponsored placement.

Two examples we shared recently:
- {Real example with link}
- {Real example with link}

Drop me a line if useful — I can have something over by {date}.

Cheers,
{You}
```

### HARO-equivalents in India
- **Featured.com / Help a B2B Writer / Qwoted** — global but reach Indian writers.
- **SourceBottle India** — limited; fall back to journalists' Twitter/LinkedIn outreach.
- **Linkedin "open for media requests"** filter — surprisingly effective for Indian lifestyle press.

### Link-earning mechanics built into the product
- "Best of {city}" badges that pubs proudly embed back to their detail page.
- Annual partner awards page that pubs link to in their press kits.
- Open data widgets ("Royvento Index" of pub-booking volume by city) embeddable by bloggers.

### What **not** to do
- Don't buy directory backlinks (PBNs, low-quality web 2.0).
- Don't reciprocal-link with random partners.
- Don't publish syndicated copies of competitor blog posts.
- Don't run "guest post" exchanges with off-topic SaaS sites.

---

## 10. 90-Day Content Calendar

> See **`docs/seo/content-calendar.md`** — 12 weeks fully planned (cornerstone + supporting per week, internal links, distribution checklist, Indian seasonality anchors).

---

## 11. Competitor Analysis

| Competitor | Primary intent owned | URL/content shape | Schema usage | Backlink shape | Where Royvento can win |
|------------|----------------------|-------------------|--------------|----------------|------------------------|
| **BookMyShow** | Ticketed events ("buy tickets to {event}") | `/explore/events-{city}`, `/buytickets/{event}-{city}/{id}` | `Event`, `Offer`, `BreadcrumbList`, very strong | Massive; press, app stores, ticket affiliates | Pub *table* booking & free-entry events — BMS has weak SERP for these. Long-tail locality + category. |
| **Insider.in (Paytm Insider)** | Ticketed events, comedy, music gigs | `/{city}/...event-name`, very clean URLs, Paytm authority | `Event`, `Offer` | Strong; Paytm halo | Same as BMS — BMS and Insider are ticket-led, not table-booking-led. We win on "book a table for 4 at {pub}". |
| **District by Zomato** | Pubs + events + dining hybrid (Zomato repackaging) | Subdomain + path; in flux post-acquisition | Mixed; Zomato schema is partial on the new property | Inheriting Zomato authority but suffering URL churn from rebrand | URL churn is our window. We own NYE/seasonal hubs while District migrations stall. |
| **Townscript** | DIY ticketing for organizers | `/{city}/event-name` | `Event`, `Offer` | Weak vs BMS | They're seller-side; we're buyer-side. No real overlap on consumer SERP. |
| **Explara** | DIY ticketing | Similar to Townscript | `Event` | Weak | Same as Townscript. |
| **AllEvents.in** | Event aggregation, broad + low quality | `/{event-slug}/{city}` thin pages | Light schema | Spammy backlink profile | High-volume but low-trust; we win on quality + verified offers. |
| **Skillbox** | Tech/creator events | Niche; low overlap | `Event` | Niche communities | Not a real competitor. |
| **LBB** | Editorial discovery (blogs that rank for "best X in Y") | Long-form lists | Light | Strong domain authority | We **partner** here — link to LBB editorially, pitch them our data, earn links back. |
| **Magicpin** | Offer-led discovery (cashback) | Listing pages with offers | Light | Strong; consumer brand | They lead with discount; we lead with verified booking + curated experience. Different positioning. |
| **EazyDiner / Dineout** | Dining reservations, fine dining tilt | `/restaurants/{city}/{slug}` | `Restaurant`, `Offer` | Mid-strong | Pub/nightlife is not their focus — couple-friendly, NYE, late-night is winnable. |

### Royvento's positioning (where we can win, in one paragraph)
**"Book a real table at a real pub tonight."** BookMyShow & Insider sell tickets; Magicpin sells discounts; LBB publishes editorial; District is in transition. None of them owns "book a table for 4 at a microbrewery in Indiranagar tonight with a free entry deal." That intent — **plan + book** — is the SERP we go after, with three structural advantages: (1) programmatic city × locality × category coverage at a granularity none of them ship; (2) verified partner data that powers honest schema (open hours, real cover, real reviews); (3) bookable-from-blog editorial that closes the loop competitors leave open.

### Gap-analysis quick wins (queries competitors barely cover today)
- "couple friendly pubs in {locality}" — almost nobody owns these locality-level couple pages.
- "ladies night {city} {weekday}" — date-modified queries are wide open.
- "free entry pubs {city}" — Magicpin has offer pages but no free-entry-specific landing.
- "birthday party at a pub in {city}" — pure occasion-funnel, no category leader.
- "IPL screening {city}" / "Premier League screening {city}" — seasonally exploitable.
- "open now {locality} pub" — GBP-only today; we can capture via internal listings.

---

## 12. AI SEO (AI Overviews, voice, snippets)

### Structuring content to be **cited** by Google AI Overviews
- Lead with a **direct, ≤40-word answer** to the page's main question. Example for a pub detail page: *"Toit, Indiranagar Bangalore, is a microbrewery known for its in-house craft beers and wood-fired pizza. Book a table on Royvento; weekday cover is ₹0, weekend ₹500 redeemable on F&B."*
- Use **definition + list + table** patterns (these get pulled into snippets and AI Overviews most often).
- Include an **FAQPage schema** block of 6–10 Q&As per template.
- Cite primary sources (the pub's own GBP, our verified data) — AI Overviews increasingly attribute by source clarity.

### Voice queries
Phrase headings as natural-language questions where it makes sense:
- "What are the best rooftop pubs in Mumbai?"
- "Where can I book a birthday party in Bangalore?"
- "Which Bangalore pub has the cheapest happy hours?"
Then answer in the next 1–2 sentences.

### Featured snippets we want to win
- **Definition snippets**: "What is a microbrewery?", "What is a hookah lounge?", "What is a brewpub?" — short paragraph answer + supporting list.
- **List snippets**: "Best pubs in {city}", numbered list, 8–10 items.
- **Table snippets**: "{City} pub cover charge by area", clean `<table>`.
- **Step snippets**: "How to book a pub on Royvento", numbered `<ol>`.

### To be cited by ChatGPT, Perplexity, Claude
- Allow `GPTBot`, `PerplexityBot`, `ClaudeBot`, `Google-Extended` in robots.txt (see §5).
- Ship a `/llms.txt` at the root summarizing the site's structure and key data sources (a one-page text file pointing AI crawlers to high-quality canonical pages).
- Make sure schema is in the **initial HTML** (not post-hydration) — AI crawlers usually don't execute JS.
- Author bios and dated content (`datePublished`, `dateModified`) help LLMs decide what's current.

---

## 13. E-E-A-T (Experience, Expertise, Authoritativeness, Trust)

Google's pub/event vertical has YMYL-adjacent risk (alcohol, age restrictions, payment) so E-E-A-T matters more than in pure entertainment.

### Concrete E-E-A-T moves (each maps to a deliverable)
1. **Author bios** on every blog post: real photo, role, city, social links, ≥3 prior posts.
2. **On-the-ground verification** badge: pubs marked "Royvento-verified" once we've called/visited; show last verified date.
3. **Editorial policy page** (`/editorial-policy`): how we pick "best of" lists, that listings are not paid placements, how we handle errors.
4. **Transparency page** (`/about` or `/transparency`): who we are, where we're based, contact, data sources, response times.
5. **Reviews integrity**: only verified-booking reviews; flag suspicious patterns; publish a reviews policy.
6. **Partner verification**: KYC summary visible (verified address, verified phone, verified UPI/PG). Don't expose PII — just badges.
7. **Citations**: link out to credible sources in editorial content (Indian liquor laws by state, GBP API definitions, age-restriction rules).
8. **Update cadence**: every programmatic page shows a `lastUpdated` date; refresh quarterly minimum.
9. **Corrections policy**: a "Report an issue" button on every pub/event page that opens a structured form.
10. **About-the-data** explainer linked from booking-data PR posts (sample size, methodology, caveats).

---

## 14. Action Plan

> Full prioritized table: **`docs/seo/action-plan.md`** (Easy / Medium / Long-term, with effort, impact, owner, and repo touchpoints). Key shape below.

**Easy wins (≤2 weeks, ship now)** — per-route SEO meta + canonical + OG (E1), default + per-template OG (E2), DB-driven sitemap split (E3), robots.txt (E4), JSON-LD pass on existing templates (E5), slugged pub/event URLs with 301s (E6), H1 audit (E7), ALT pattern (E8), blog ↔ programmatic internal links (E9), partner GBP onboarding 1-pager (E10), `index.html` polish (E11), `noindex` on auth/dashboard (E12).

**Medium (2–8 weeks)** — city / locality / category templates (M1–M3), occasion programmatic pages (M4), prerender or SSR for public routes (M5), Core Web Vitals + image CDN (M6–M7), FAQPage + Review schema (M8–M9), social/preview validation (M10), SearchAction sitelinks (M11), E-E-A-T pages (M12), freshness module (M13), URL migration audit (M14).

**Long-term (8+ weeks)** — full SSR/edge rendering (L1), programmatic at scale with content guardrails (L2), backlink and PR program (L3), original-data assets (L4), verification badge product surface (L5), AI/voice optimization (L6), hreflang + multilingual rollout if/when justified (L7–L9).

### Expected growth timeline (India nightlife/event vertical, realistic)
- **0–3 months**: indexation of all pub/event/offer pages; brand SERP cleaned; 5–15k organic sessions/month.
- **3–6 months**: programmatic city/locality pages start ranking 10–30; 30–80k sessions/month; first lifestyle press backlinks land.
- **6–12 months**: top-10 rankings on locality + category combos in tier-1 cities; NYE seasonal hub captures large traffic spike; 100–300k organic sessions/month with a 2–4% organic→booking conversion target.

---

## Appendix A — Page-template ↔ keyword-bucket map (cheat sheet)

| Page template | Existing file (or new) | Primary keyword bucket | Schema |
|---------------|------------------------|------------------------|--------|
| Home | `pages/home.tsx` | Brand + category-defining | Organization, WebSite (SearchAction), BreadcrumbList |
| City hub | **new** `pages/city.tsx` | City | CollectionPage, ItemList(BarOrPub), FAQPage, BreadcrumbList |
| Locality | **new** `pages/locality.tsx` | Locality | CollectionPage, ItemList, FAQPage, Place, BreadcrumbList |
| Category × city | **new** `pages/category.tsx` | Category × city | CollectionPage, ItemList, FAQPage, BreadcrumbList |
| Occasion × city | **new** `pages/occasion-city.tsx` | Occasion / programmatic | CollectionPage, ItemList, FAQPage, BreadcrumbList |
| Seasonal × city | extends `pages/pub-offers.tsx` | Seasonal | ItemList(Event/Offer), FAQPage, BreadcrumbList |
| Pub detail | `pages/vendor-detail.tsx` (slug-migrate) | Pub-specific long-tail | BarOrPub (+Restaurant), AggregateRating, Review, Offer, BreadcrumbList |
| Event detail | `pages/event-detail.tsx` (slug-migrate) | Event-specific | Event, Offer, BreadcrumbList |
| Offers index | `pages/pub-offers.tsx` | Offer | ItemList(Offer), BreadcrumbList |
| Blog hub | `pages/blogs.tsx` | Informational | CollectionPage, ItemList(BlogPosting) |
| Blog post | `pages/blog-detail.tsx` | Informational | BlogPosting, FAQPage, BreadcrumbList |
| Partner landing | **new** `pages/partner-landing.tsx` | Partner acquisition | Organization, FAQPage |

## Appendix B — Files to create (engineering reference)

- `artifacts/royvento/src/components/SEO.tsx` — wraps `react-helmet-async`; props for title, description, canonical, OG image, JSON-LD blocks.
- `artifacts/royvento/public/robots.txt` — per §5.
- `artifacts/api-server/src/routes/sitemap.ts` — emits `/sitemap-index.xml` and the shards (`-static`, `-cities`, `-pubs`, `-events`, `-offers`, `-blogs`).
- `artifacts/royvento/src/pages/{city,locality,category,occasion-city,partner-landing}.tsx` — new templates.
- `artifacts/api-server/src/routes/seo.ts` — endpoints for editorial copy (`seo_pages` table), city/locality/category aggregations.
- `lib/db/schema/seo_pages.ts` — `(template, city, locality?, category?, occasion?)` keyed editorial CMS rows.
- `lib/api-spec/openapi.yaml` — add the seo + sitemap endpoints; regen client per workspace convention.
- `artifacts/royvento/public/llms.txt` — concise site map for AI crawlers.

---

*End of playbook. Track changes via PRs to `docs/seo/`. Treat this as a living document — refresh §1, §6, §10, §11 quarterly.*
