import { useEffect } from "react";
import { useParams, useLocation, Redirect } from "wouter";
import { parseTrailingId, pubDetailSlug, eventDetailSlug } from "@/lib/seo-slug";
import { VendorDetail } from "@/pages/vendor-detail";
import { EventDetail } from "@/pages/event-detail";
import { useGetVendor, useGetEvent } from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";
import { Spinner } from "@/components/ui/spinner";

/**
 * Routing strategy for SEO-friendly slugged detail URLs:
 *
 *   /pubs/:city/:slug   → renders VendorDetail directly (canonical URL)
 *   /events/:city/:slug → renders EventDetail directly  (canonical URL)
 *
 *   /vendors/:id        → fetches vendor, then SPA-redirects to its slug URL
 *   /events/:id         → fetches event,  then SPA-redirects to its slug URL
 *
 * Net effect: the slugged URL is the primary content URL. Hits to the
 * legacy ID URL are forwarded to the slugged URL on first render so the
 * address bar, all internal links, and rel=canonical agree on the same
 * canonical URL — even though the SPA can't issue a true HTTP 301.
 */

function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-32">
      <Spinner />
    </div>
  );
}

export function VendorSlugRoute() {
  const params = useParams();
  const id = parseTrailingId(params["slug"] ?? "");
  if (!id) return <NotFound />;
  return <VendorDetail vendorIdProp={id} />;
}

export function EventSlugRoute() {
  const params = useParams();
  const id = parseTrailingId(params["slug"] ?? "");
  if (!id) return <NotFound />;
  return <EventDetail eventIdProp={id} />;
}

export function VendorLegacyRedirect() {
  const params = useParams();
  const id = Number(params["id"]);
  const { data: vendor, isLoading } = useGetVendor(id, {
    query: { enabled: Number.isFinite(id) && id > 0 } as any,
  });
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!vendor) return;
    const target = pubDetailSlug({
      id: vendor.id,
      name: vendor.businessName,
      city: vendor.city,
    });
    if (typeof window !== "undefined" && window.location.pathname !== target) {
      setLocation(target, { replace: true });
    }
  }, [vendor, setLocation]);
  if (!Number.isFinite(id) || id <= 0) return <NotFound />;
  if (isLoading || !vendor) return <PageSpinner />;
  // Render content while redirect is queued so crawlers without JS still
  // see the detail page; canonical tag points at the slug URL.
  return <VendorDetail vendorIdProp={id} />;
}

export function EventLegacyRedirect() {
  const params = useParams();
  const id = Number(params["id"]);
  const { data: event, isLoading } = useGetEvent(id, {
    query: { enabled: Number.isFinite(id) && id > 0 } as any,
  });
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!event) return;
    const target = eventDetailSlug({
      id: event.id,
      title: event.title,
      city: (event as any).city ?? (event as any).vendor?.city,
      date: (event as any).eventDate,
    });
    if (typeof window !== "undefined" && window.location.pathname !== target) {
      setLocation(target, { replace: true });
    }
  }, [event, setLocation]);
  if (!Number.isFinite(id) || id <= 0) return <NotFound />;
  if (isLoading || !event) return <PageSpinner />;
  return <EventDetail eventIdProp={id} />;
}

// Re-exports kept for backwards compatibility with earlier App.tsx imports
export { Redirect };
