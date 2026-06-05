import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import NotFound from "@/pages/not-found";

import { Navbar } from "@/components/layout/Navbar";
import { PromoMarquee } from "@/components/layout/PromoMarquee";
import { Footer } from "@/components/layout/Footer";
import { SEO } from "@/components/SEO";

// Home is the landing route — keep it eager so first paint needs no extra
// round-trip. Every other page is code-split and loaded on demand, which
// keeps the initial JS bundle small and the site fast to first interaction.
import { Home } from "@/pages/home";

const Pubs = lazy(() => import("@/pages/pubs").then((m) => ({ default: m.Pubs })));
const PubOffers = lazy(() => import("@/pages/pub-offers").then((m) => ({ default: m.PubOffers })));
const Events = lazy(() => import("@/pages/events").then((m) => ({ default: m.Events })));
const Vendors = lazy(() => import("@/pages/vendors").then((m) => ({ default: m.Vendors })));
const Login = lazy(() => import("@/pages/login").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("@/pages/register").then((m) => ({ default: m.Register })));
const Contact = lazy(() => import("@/pages/contact").then((m) => ({ default: m.Contact })));
const Bookings = lazy(() => import("@/pages/bookings").then((m) => ({ default: m.Bookings })));
const Profile = lazy(() => import("@/pages/profile").then((m) => ({ default: m.Profile })));
const BecomeVendor = lazy(() => import("@/pages/become-vendor").then((m) => ({ default: m.BecomeVendor })));
const Wishlist = lazy(() => import("@/pages/wishlist").then((m) => ({ default: m.Wishlist })));
const Notifications = lazy(() => import("@/pages/notifications").then((m) => ({ default: m.Notifications })));
const ForgotPassword = lazy(() => import("@/pages/forgot-password").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("@/pages/reset-password").then((m) => ({ default: m.ResetPassword })));
const PaymentResult = lazy(() => import("@/pages/payment-result").then((m) => ({ default: m.PaymentResult })));
const Terms = lazy(() => import("@/pages/terms").then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import("@/pages/privacy").then((m) => ({ default: m.Privacy })));
const City = lazy(() => import("@/pages/city").then((m) => ({ default: m.City })));
const CitySecondary = lazy(() => import("@/pages/city-secondary").then((m) => ({ default: m.CitySecondary })));
const VendorSlugRoute = lazy(() => import("@/pages/slugged-detail-redirect").then((m) => ({ default: m.VendorSlugRoute })));
const EventSlugRoute = lazy(() => import("@/pages/slugged-detail-redirect").then((m) => ({ default: m.EventSlugRoute })));
const VendorLegacyRedirect = lazy(() => import("@/pages/slugged-detail-redirect").then((m) => ({ default: m.VendorLegacyRedirect })));
const EventLegacyRedirect = lazy(() => import("@/pages/slugged-detail-redirect").then((m) => ({ default: m.EventLegacyRedirect })));

// Lazily loaded heavy/role-gated pages
const VendorDashboard = lazy(() => import("@/pages/vendor-dashboard").then((m) => ({ default: m.VendorDashboard })));
const VendorListingEditPage = lazy(() => import("@/pages/vendor-dashboard").then((m) => ({ default: m.VendorListingEditPage })));
const TicketScanner = lazy(() => import("@/pages/ticket-scanner").then((m) => ({ default: m.TicketScanner })));
const AdminPanel = lazy(() => import("@/pages/admin").then((m) => ({ default: m.AdminPanel })));
const OrganizerDashboard = lazy(() => import("@/pages/organizer-dashboard").then((m) => ({ default: m.OrganizerDashboard })));
const BecomeOrganizer = lazy(() => import("@/pages/organizer-dashboard").then((m) => ({ default: m.BecomeOrganizer })));
const OrganizerProfile = lazy(() => import("@/pages/organizer-profile").then((m) => ({ default: m.OrganizerProfile })));
const OrganizerEventDetail = lazy(() => import("@/pages/organizer-profile").then((m) => ({ default: m.OrganizerEventDetail })));
const Subscription = lazy(() => import("@/pages/subscription").then((m) => ({ default: m.Subscription })));
const Blogs = lazy(() => import("@/pages/blogs").then((m) => ({ default: m.Blogs })));
const BlogDetail = lazy(() => import("@/pages/blog-detail").then((m) => ({ default: m.BlogDetail })));

function PageFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6">
      <img
        src="/images/logo-icon.png"
        alt="Royvento"
        width={72}
        height={72}
        className="h-[72px] w-[72px] object-contain animate-pulse select-none"
        draggable={false}
      />
      <Spinner />
    </div>
  );
}

import { RequireAuth } from "@/components/RequireAuth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LocationProvider } from "@/components/LocationContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function DashboardRedirect() {
  const { data, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!data?.user) {
      setLocation("/login");
      return;
    }
    if (data.user.role === "admin") {
      setLocation("/admin");
    } else if (data.user.role === "vendor") {
      setLocation("/dashboard/vendor");
    } else if (data.user.role === "organizer") {
      setLocation("/dashboard/organizer");
    } else {
      setLocation("/dashboard/profile");
    }
  }, [data, isLoading, setLocation]);

  return (
    <div className="flex items-center justify-center py-32">
      <Spinner />
    </div>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function OAuthErrorHandler() {
  const { toast } = useToast();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const verified = params.get("verified");
    if (!error && !verified) return;
    if (verified === "1") {
      toast({ title: "Email verified!", description: "Welcome to Royvento. You're now logged in." });
    } else if (error === "google_not_configured") {
      toast({ title: "Google sign-in coming soon", description: "This feature isn't available yet. Please sign in with your email instead." });
    } else if (error === "google_auth_failed") {
      toast({ title: "Google sign-in failed", description: "Something went wrong. Please try again or sign in with email.", variant: "destructive" });
    }
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
  }, []);
  return null;
}

function Router() {
  const [location] = useLocation();
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <ScrollToTop />
      <OAuthErrorHandler />
      <Navbar />
      {location === "/" && <PromoMarquee />}
      <main className="flex-1">
        <ErrorBoundary resetKey={location}>
        <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/" component={Home} />
          {/* Explore page removed — redirect legacy/external links to Pubs */}
          <Route path="/explore"><Redirect to="/pubs" /></Route>
          <Route path="/pubs" component={Pubs} />
          <Route path="/pub-offers" component={PubOffers} />
          <Route path="/events" component={Events} />
          <Route path="/vendors" component={Vendors} />
          <Route path="/partners" component={Vendors} />
          {/* Legacy ID URLs auto-redirect to the slugged canonical URL.
              The wrapper still renders VendorDetail/EventDetail so non-JS
              crawlers (and the brief moment before the SPA navigation)
              still see the full detail content with the canonical tag. */}
          <Route path="/events/:id" component={EventLegacyRedirect} />
          <Route path="/vendors/:id" component={VendorLegacyRedirect} />
          <Route path="/partners/:id" component={VendorLegacyRedirect} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/contact" component={Contact} />
          <Route path="/hot-deals">{() => <Redirect to="/pub-offers" />}</Route>
          <Route path="/profile">{() => (<><SEO title="My Profile | Royvento" canonical="/dashboard/profile" noindex /><Redirect to="/dashboard/profile" /></>)}</Route>
          <Route path="/dashboard">{() => <DashboardRedirect />}</Route>
          <Route path="/blog">{() => <Redirect to="/blogs" />}</Route>
          <Route path="/premium">{() => <Redirect to="/subscription" />}</Route>
          <Route path="/subscription" component={Subscription} />
          <Route path="/blogs" component={Blogs} />
          <Route path="/blogs/:slug" component={BlogDetail} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/payment-result" component={PaymentResult} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />

          <Route path="/wishlist">
            {() => <RequireAuth><Wishlist /></RequireAuth>}
          </Route>
          <Route path="/notifications">
            {() => <RequireAuth><Notifications /></RequireAuth>}
          </Route>
          <Route path="/dashboard/profile">
            {() => <RequireAuth><Profile /></RequireAuth>}
          </Route>
          <Route path="/dashboard/become-vendor">
            {() => <RequireAuth role="user"><BecomeVendor /></RequireAuth>}
          </Route>
          <Route path="/dashboard/vendor">
            {() => <RequireAuth role="vendor"><VendorDashboard /></RequireAuth>}
          </Route>
          <Route path="/dashboard/partner">
            {() => <RequireAuth role="vendor"><VendorDashboard /></RequireAuth>}
          </Route>
          <Route path="/dashboard/vendor/listings/:id/edit">
            {() => <RequireAuth role="vendor"><VendorListingEditPage /></RequireAuth>}
          </Route>
          <Route path="/dashboard/vendor/scanner">
            {() => <RequireAuth><TicketScanner /></RequireAuth>}
          </Route>
          <Route path="/dashboard/bookings">
            {() => <RequireAuth><Bookings /></RequireAuth>}
          </Route>
          <Route path="/admin">
            {() => <RequireAuth role="admin"><AdminPanel /></RequireAuth>}
          </Route>

          {/* Event Organizer vertical — separate from Pub/Club partner. */}
          <Route path="/dashboard/become-organizer">
            {() => <RequireAuth><BecomeOrganizer /></RequireAuth>}
          </Route>
          <Route path="/dashboard/organizer">
            {() => <RequireAuth role="organizer"><OrganizerDashboard /></RequireAuth>}
          </Route>

          {/* SEO-friendly slugged detail URLs (canonical) — redirect to legacy
              detail components which set rel=canonical back to the slug URL. */}
          <Route path="/pubs/:city/:slug" component={VendorSlugRoute} />
          <Route path="/events/:city/:slug" component={EventSlugRoute} />

          {/* Public organizer pages — must precede the greedy /:city patterns. */}
          <Route path="/organizers/:slug" component={OrganizerProfile} />
          <Route path="/organizer-events/:slug" component={OrganizerEventDetail} />

          {/* Programmatic city / locality / category landing pages.
              These greedy patterns must come AFTER all specific top-level
              routes so they only catch unmatched URLs. */}
          <Route path="/:city/:second" component={CitySecondary} />
          <Route path="/:city" component={City} />

          <Route component={NotFound} />
        </Switch>
        </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocationProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </LocationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
