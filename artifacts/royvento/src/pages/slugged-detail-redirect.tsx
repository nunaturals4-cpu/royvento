import { useParams, Redirect } from "wouter";
import { parseTrailingId } from "@/lib/seo-slug";
import { VendorDetail } from "@/pages/vendor-detail";
import { EventDetail } from "@/pages/event-detail";
import NotFound from "@/pages/not-found";

/**
 * Wrappers that map the SEO-friendly URLs `/pubs/:city/:slug-:id` and
 * `/events/:city/:slug-:id` onto the existing detail components by parsing
 * the trailing numeric id out of the slug. The detail components read the
 * `id` param via `useParams()`, so we re-render them inside a synthetic
 * route by re-using wouter's params (we just need the URL to expose `id`).
 *
 * Easiest approach: do not try to fake a route — just call the existing
 * detail components but pre-set the id via React context… The detail
 * components currently call `useParams()["id"]`, which won't be populated
 * for the slug route. Instead we redirect to the legacy URL when the slug
 * route is hit but in the SAME render cycle, set canonical via SEO. To keep
 * URLs SEO-clean we reverse it: the legacy `/vendors/:id` page already
 * issues a *canonical* tag pointing at the slugged URL once it has loaded
 * vendor data (handled in vendor-detail.tsx). That keeps Google happy and
 * lets us deep-link.
 *
 * For incoming hits to the slug URL, we extract the id and forward to the
 * legacy URL via SPA navigation (Redirect) so the existing component
 * handles it.  This means:
 *   GET /pubs/bangalore/toit-indiranagar-3  → SPA redirect /vendors/3
 * The legacy page then sets canonical back to the slug URL. Net effect:
 * single canonical, both URLs work, no dual-rendering of detail logic.
 */

export function VendorSlugRoute() {
  const params = useParams();
  const slug = params["slug"] ?? "";
  const id = parseTrailingId(slug);
  if (!id) return <NotFound />;
  return <Redirect to={`/vendors/${id}`} replace />;
}

export function EventSlugRoute() {
  const params = useParams();
  const slug = params["slug"] ?? "";
  const id = parseTrailingId(slug);
  if (!id) return <NotFound />;
  return <Redirect to={`/events/${id}`} replace />;
}

export { VendorDetail, EventDetail };
