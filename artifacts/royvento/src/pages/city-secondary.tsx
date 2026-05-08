import { Link, useParams, Redirect } from "wouter";
import { SEO, buildBreadcrumbList, buildFAQPage } from "@/components/SEO";
import { EventCard } from "@/components/EventCard";
import { CrossLinkRail } from "@/components/CrossLinkRail";
import {
  useGetSeoPage,
  getGetSeoPageQueryKey,
  useGetLocalitySummary,
  getGetLocalitySummaryQueryKey,
  useGetCategorySummary,
  getGetCategorySummaryQueryKey,
  type VendorSummary,
} from "@workspace/api-client-react";
import {
  PUB_CATEGORY_SLUGS,
  canonicalCitySlug,
  findCategoryBySlug,
  isAliasedCity,
  isCategorySlug,
  pubDetailSlug,
  slugify,
  titleCase,
} from "@/lib/seo-slug";
import NotFound from "@/pages/not-found";
import { Spinner } from "@/components/ui/spinner";
import { MapPin } from "lucide-react";

const THIN_THRESHOLD = 4;

function vendorToCardEvent(v: VendorSummary) {
  return {
    id: v.id,
    title: v.businessName,
    category: v.category,
    type: "pub",
    location: `${v.city ?? ""}${v.state ? ", " + v.state : ""}`.trim() || (v.city ?? ""),
    city: v.city ?? undefined,
    state: v.state ?? undefined,
    price: 0,
    imageUrl: v.bannerImage || "",
    rating: v.rating,
    reviewCount: v.reviewCount,
    partnerName: v.businessName,
  };
}

function buildCategoryFAQs(category: string, cityName: string) {
  return [
    {
      question: `Which is the best ${category.toLowerCase()} venue in ${cityName}?`,
      answer: `Our top-rated ${category.toLowerCase()} venues in ${cityName} are listed above, sorted by Royvento member ratings and review volume. Tap any pub to see photos, today's offers and book a table instantly.`,
    },
    {
      question: `Do ${category.toLowerCase()} pubs in ${cityName} take advance bookings?`,
      answer: `Yes, every ${category.toLowerCase()} venue listed on Royvento accepts instant table reservations — no calls, no waiting. Bookings are confirmed in seconds.`,
    },
    {
      question: `Are there happy-hour offers at ${category.toLowerCase()} pubs in ${cityName}?`,
      answer: `Many partner pubs run happy-hour and ladies' night deals. Check the offers section on each pub's page for current drink plans and free-entry windows.`,
    },
  ];
}

function buildLocalityFAQs(localityName: string, cityName: string) {
  return [
    {
      question: `Which is the most famous pub in ${localityName}?`,
      answer: `The top-rated pubs in ${localityName}, ${cityName} are listed above, ranked by Royvento member ratings. Tap any pub to see photos, hours and instant booking.`,
    },
    {
      question: `What's a typical cover charge in ${localityName} pubs?`,
      answer: `Cover charges vary by night and venue. Many pubs in ${localityName} have free entry on weekdays and a couple cover at weekends — Royvento shows the latest offers and free-entry days on each pub page.`,
    },
    {
      question: `Where can I park near ${localityName} pubs?`,
      answer: `Most pubs in ${localityName} either offer valet parking or are close to public parking lots. Check each pub's detail page on Royvento for parking notes and address.`,
    },
  ];
}

export function CitySecondary() {
  const params = useParams();
  const rawCity = params["city"] ?? "";
  const second = params["second"] ?? "";
  const citySlug = canonicalCitySlug(rawCity);
  const cityName = titleCase(citySlug);
  const isCategory = isCategorySlug(second);
  const category = isCategory ? findCategoryBySlug(second) : null;
  const localitySlug = !isCategory ? slugify(second) : "";
  const localityName = localitySlug ? titleCase(localitySlug) : "";

  type CategorySlugParam = Parameters<typeof useGetCategorySummary>[1];
  const categorySlug = (isCategory && category ? category.slug : "pubs") as CategorySlugParam;
  const {
    data: catSummary,
    isLoading: catLoading,
    isError: catError,
  } = useGetCategorySummary(citySlug, categorySlug, {
    query: {
      queryKey: getGetCategorySummaryQueryKey(citySlug, categorySlug),
      enabled: !!citySlug && isCategory,
      staleTime: 5 * 60 * 1000,
    },
  });
  const {
    data: locSummary,
    isLoading: locLoading,
    isError: locError,
  } = useGetLocalitySummary(citySlug, localitySlug, {
    query: {
      queryKey: getGetLocalitySummaryQueryKey(citySlug, localitySlug),
      enabled: !!citySlug && !isCategory && !!localitySlug,
      staleTime: 5 * 60 * 1000,
    },
  });

  if (rawCity && isAliasedCity(rawCity) && rawCity !== citySlug) {
    return <Redirect to={`/${citySlug}/${slugify(second)}`} replace />;
  }

  if (!citySlug || !second) return <NotFound />;

  const isLoading = isCategory ? catLoading : locLoading;
  const isErr = isCategory ? catError : locError;
  const summary = isCategory ? catSummary : locSummary;
  const topPubs: VendorSummary[] = summary?.topVendors ?? [];
  const count = summary?.vendorCount ?? 0;
  const isThin = count < THIN_THRESHOLD;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner />
      </div>
    );
  }
  if (isErr || !summary) return <NotFound />;

  const subjectLabel = isCategory ? category!.label : "Pubs";
  const subjectName = isCategory ? category!.label : `${localityName}`;
  const defaultTitle = isCategory
    ? `${category!.label} in ${cityName} — Book a Table | Royvento`
    : `Best Pubs in ${localityName}, ${cityName} — Book Online | Royvento`;
  const defaultDescription = isCategory
    ? `${count || "Top-rated"} ${category!.label.toLowerCase()} venues in ${cityName} with instant booking, prices, photos and offers. Updated weekly on Royvento.`
    : `Top pubs in ${localityName}, ${cityName} with instant table booking, ladies' nights, happy hours and weekend parties. ${count} verified pubs on Royvento.`;

  const canonical = `/${citySlug}/${isCategory ? category!.slug : localitySlug}`;
  const breadcrumbs = buildBreadcrumbList([
    { name: "Home", url: "/" },
    { name: cityName, url: `/${citySlug}` },
    { name: subjectName, url: canonical },
  ]);

  const h1 = isCategory
    ? `${count || ""} Best ${category!.label} in ${cityName}`.trim()
    : `Best Pubs in ${localityName}, ${cityName}`;

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: h1,
    itemListElement: topPubs.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "BarOrPub",
        name: v.businessName,
        address: v.address ?? cityName,
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
                pubDetailSlug({
                  id: v.id,
                  name: v.businessName,
                  city: v.city ?? undefined,
                  locality: !isCategory ? localitySlug : undefined,
                }),
                window.location.origin,
              ).toString()
            : pubDetailSlug({ id: v.id, name: v.businessName, city: v.city ?? undefined }),
      },
    })),
  };
  // Editorial override from the admin-editable seo_pages table.
  const seoParams = {
    template: (isCategory ? "category" : "locality") as "category" | "locality",
    citySlug,
    secondSlug: isCategory ? category!.slug : localitySlug,
  };
  const { data: seoOverride } = useGetSeoPage(seoParams, {
    query: {
      queryKey: getGetSeoPageQueryKey(seoParams),
      retry: false,
      staleTime: 5 * 60 * 1000,
    },
  });
  const overrideFaqs = (seoOverride?.faqs ?? []).map((f) => ({
    question: f.q,
    answer: f.a,
  }));
  const programmaticFaqs = isCategory
    ? buildCategoryFAQs(category!.label, cityName)
    : buildLocalityFAQs(localityName, cityName);
  const faqs = overrideFaqs.length > 0 ? overrideFaqs : programmaticFaqs;
  const introOverride = seoOverride?.introMd?.trim() || null;
  const title = seoOverride?.title?.trim() || defaultTitle;
  const description = seoOverride?.metaDescription?.trim() || defaultDescription;
  const jsonLd = [breadcrumbs, itemList, buildFAQPage(faqs)];

  // Cross-link rails
  const otherCategories = PUB_CATEGORY_SLUGS.filter(
    (c) => !isCategory || c.slug !== category!.slug,
  )
    .slice(0, 8)
    .map((c) => ({
      href: `/${citySlug}/${c.slug}`,
      label: `${c.label} in ${cityName}`,
    }));

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <SEO
        title={title}
        description={description}
        canonical={canonical}
        noindex={isThin}
        jsonLd={jsonLd}
      />
      <nav className="text-xs text-white/50 mb-6" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span className="mx-2">/</span>
        <Link href={`/${citySlug}`} className="hover:text-primary">{cityName}</Link>
        <span className="mx-2">/</span>
        <span className="text-white/80">{subjectName}</span>
      </nav>

      <header className="max-w-3xl mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" /> {cityName}
        </p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-3">{h1}</h1>
        <p className="mt-4 text-white/60 leading-relaxed whitespace-pre-line">
          {introOverride
            ?? (isCategory
              ? `Hand-picked ${category!.label.toLowerCase()} in ${cityName} with instant table booking, photos, ratings and current offers. Filter further by locality, free-entry days and drink deals.`
              : `Top pubs and party venues in ${localityName}, ${cityName} with verified ratings, instant booking and weekly offers.`)}
        </p>
      </header>

      {isThin ? (
        <div className="rounded-3xl glass-card p-12 text-center mb-12">
          <p className="font-serif text-2xl mb-2">
            We're still adding {subjectLabel.toLowerCase()} {!isCategory ? "in this area" : ""}
          </p>
          <p className="text-white/60">
            Try{" "}
            <Link href={`/${citySlug}`} className="text-primary hover:underline">
              all pubs in {cityName}
            </Link>{" "}
            or{" "}
            <Link href="/pubs" className="text-primary hover:underline">browse all pubs</Link>.
          </p>
          {topPubs.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              {topPubs.map((v) => (
                <EventCard key={v.id} event={vendorToCardEvent(v)} hidePubBadge directBooking />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <h2 className="font-serif text-2xl mb-6">Top picks {!isCategory ? `in ${localityName}` : ""}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {topPubs.map((v) => (
              <EventCard key={v.id} event={vendorToCardEvent(v)} hidePubBadge directBooking />
            ))}
          </div>
        </>
      )}

      <CrossLinkRail
        title={isCategory ? "Other categories" : `Also see categories in ${cityName}`}
        links={otherCategories}
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
