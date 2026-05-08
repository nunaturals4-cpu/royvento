import { useEffect, useMemo, useState } from "react";
import { Link, useParams, Redirect } from "wouter";
import { SEO, buildBreadcrumbList, buildFAQPage } from "@/components/SEO";
import { EventCard } from "@/components/EventCard";
import { CrossLinkRail } from "@/components/CrossLinkRail";
import { apiGet } from "@/lib/api";
import { useGetSeoPage } from "@workspace/api-client-react";
import {
  PUB_CATEGORY_SLUGS,
  canonicalCitySlug,
  isAliasedCity,
  pubDetailSlug,
  slugify,
  titleCase,
} from "@/lib/seo-slug";
import NotFound from "@/pages/not-found";
import { Spinner } from "@/components/ui/spinner";
import { MapPin } from "lucide-react";

interface VendorRow {
  id: number;
  businessName: string;
  category: string;
  city?: string;
  state?: string;
  location?: string;
  address?: string | null;
  rating: number;
  reviewCount: number;
  bannerImage?: string;
  coverImageUrl?: string;
}

const THIN_THRESHOLD = 4;

function buildCityFAQs(cityName: string): { question: string; answer: string }[] {
  return [
    {
      question: `Which area in ${cityName} has the best pubs?`,
      answer: `${cityName}'s nightlife is spread across several lively neighbourhoods. Browse by locality on Royvento to find the best pubs near you, with verified ratings, photos and instant table booking.`,
    },
    {
      question: `What's the legal drinking age in ${cityName}?`,
      answer: `The legal drinking age in ${cityName} follows the relevant state law. Carry a valid government photo ID — most pubs and clubs check at the door.`,
    },
    {
      question: `Are there ladies' nights in ${cityName}?`,
      answer: `Yes — many pubs in ${cityName} run weekly ladies' nights with free entry or complimentary drinks. Filter by Free Entry on Royvento to see today's options.`,
    },
    {
      question: `Can I book a table in advance in ${cityName}?`,
      answer: `Yes. Royvento lets you reserve a table at verified pubs in ${cityName} with instant confirmation. Look for the "Book a Table" button on each pub page.`,
    },
  ];
}

function vendorToCardEvent(v: VendorRow) {
  return {
    id: v.id,
    title: v.businessName,
    category: v.category,
    type: "pub",
    location: v.location ?? `${v.city ?? ""}${v.state ? ", " + v.state : ""}`,
    city: v.city,
    state: v.state,
    price: 0,
    imageUrl: v.coverImageUrl || v.bannerImage || "",
    rating: v.rating,
    reviewCount: v.reviewCount,
    partnerName: v.businessName,
  };
}

export function City() {
  const params = useParams();
  const rawCity = params["city"] ?? "";
  const citySlug = canonicalCitySlug(rawCity);
  const cityName = titleCase(citySlug);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!citySlug) return;
    setLoading(true);
    apiGet<VendorRow[]>(`/api/vendors?city=${encodeURIComponent(cityName)}`)
      .then((rows) => {
        setVendors(rows);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [citySlug, cityName]);

  // Aliased cities (e.g. /bengaluru) redirect to canonical (/bangalore).
  if (rawCity && isAliasedCity(rawCity) && rawCity !== citySlug) {
    return <Redirect to={`/${citySlug}`} replace />;
  }

  if (!citySlug) return <NotFound />;

  const localities = useMemo(() => {
    const counts = new Map<string, number>();
    vendors.forEach((v) => {
      const addr = v.address ?? "";
      // Pick the first comma-segment that isn't the city/state
      const parts = addr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) {
        const s = slugify(p);
        if (!s) continue;
        if (s === citySlug) continue;
        if (s === slugify(v.state ?? "")) continue;
        if (s.length < 3 || /^\d/.test(s)) continue;
        counts.set(s, (counts.get(s) ?? 0) + 1);
        break;
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([slug]) => ({ slug, label: titleCase(slug) }));
  }, [vendors, citySlug]);

  const topPubs = vendors.slice(0, 10);
  const isThin = vendors.length < THIN_THRESHOLD;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <NotFound />;
  }

  // Render an empty/thin state page (still indexable structure but noindex)
  const title = `Best Pubs in ${cityName} — Book a Table | Royvento`;
  const description = `${vendors.length}+ pubs and party venues in ${cityName} — rooftop bars, microbreweries, live music, couple-friendly. Today's offers, ladies nights, NYE parties — instant booking on Royvento.`;
  const canonical = `/${citySlug}`;
  const breadcrumbs = buildBreadcrumbList([
    { name: "Home", url: "/" },
    { name: cityName, url: canonical },
  ]);
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Best pubs in ${cityName}`,
    itemListElement: topPubs.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "BarOrPub",
        name: v.businessName,
        address: v.address ?? v.location ?? cityName,
        aggregateRating:
          v.reviewCount > 0
            ? {
                "@type": "AggregateRating",
                ratingValue: v.rating,
                reviewCount: v.reviewCount,
              }
            : undefined,
        url:
          typeof window !== "undefined"
            ? new URL(
                pubDetailSlug({ id: v.id, name: v.businessName, city: v.city }),
                window.location.origin,
              ).toString()
            : pubDetailSlug({ id: v.id, name: v.businessName, city: v.city }),
      },
    })),
  };
  // Editorial override: if an admin has saved bespoke copy for this city
  // landing page in the seo_pages table, prefer it over the programmatic
  // template. Silently falls back on 404.
  const { data: seoOverride } = useGetSeoPage(
    { template: "city", citySlug },
    { query: { retry: false, staleTime: 5 * 60 * 1000 } as any },
  );
  const overrideFaqs = (seoOverride?.faqs ?? []).map((f: any) => ({
    question: f.q,
    answer: f.a,
  }));
  const faqs = overrideFaqs.length > 0 ? overrideFaqs : buildCityFAQs(cityName);
  const introCopy = seoOverride?.introMd?.trim() || null;
  const jsonLd = [breadcrumbs, itemList, buildFAQPage(faqs)];

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <SEO
        title={title}
        description={description}
        canonical={canonical}
        noindex={isThin}
        jsonLd={jsonLd}
      />
      {/* Breadcrumb */}
      <nav className="text-xs text-white/50 mb-6" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-white/80">{cityName}</span>
      </nav>

      <header className="max-w-3xl mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" /> {cityName} nightlife
        </p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-3">
          Best Pubs in {cityName} — Book a Table Tonight
        </h1>
        <p className="mt-4 text-white/60 leading-relaxed whitespace-pre-line">
          {introCopy ?? (
            <>
              Discover {vendors.length || "the best"} verified pubs and party venues in {cityName} on Royvento.
              Filter by rooftop bars, microbreweries, live music or couple-friendly lounges.
              Book a table instantly with today's offers, ladies nights and weekend deals.
            </>
          )}
        </p>
      </header>

      {isThin ? (
        <div className="rounded-3xl glass-card p-12 text-center mb-12">
          <p className="font-serif text-2xl mb-2">We're still curating {cityName}</p>
          <p className="text-white/60">
            Royvento is rolling out across India city by city. Check back soon — or{" "}
            <Link href="/pubs" className="text-primary hover:underline">explore all pubs</Link>{" "}
            in the meantime.
          </p>
        </div>
      ) : (
        <>
          <h2 className="font-serif text-2xl mb-6">Top {Math.min(10, topPubs.length)} pubs in {cityName}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {topPubs.map((v) => (
              <EventCard key={v.id} event={vendorToCardEvent(v)} hidePubBadge />
            ))}
          </div>
        </>
      )}

      <CrossLinkRail
        title={`Localities in ${cityName}`}
        links={localities.map((l) => ({
          href: `/${citySlug}/${l.slug}`,
          label: l.label,
        }))}
      />

      <CrossLinkRail
        title="Browse by category"
        links={PUB_CATEGORY_SLUGS.map((c) => ({
          href: `/${citySlug}/${c.slug}`,
          label: `${c.label} in ${cityName}`,
        }))}
      />

      <section className="mt-16 max-w-3xl">
        <h2 className="font-serif text-2xl mb-6">Frequently asked questions</h2>
        <div className="space-y-4">
          {faqs.map((f) => (
            <div key={f.question} className="rounded-2xl glass-card p-5">
              <h3 className="font-medium mb-2">{f.question}</h3>
              <p className="text-sm text-white/70 leading-relaxed">{f.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
