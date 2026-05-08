import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, lazy, Suspense } from "react";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import NotFound from "@/pages/not-found";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SEO } from "@/components/SEO";
// Eagerly loaded pages (small, frequently visited)
import { Home } from "@/pages/home";
import { Explore } from "@/pages/explore";
import { Pubs } from "@/pages/pubs";
import { PubOffers } from "@/pages/pub-offers";
import { Vendors } from "@/pages/vendors";
import { Login } from "@/pages/login";
import { Register } from "@/pages/register";
import { Contact } from "@/pages/contact";
import { Bookings } from "@/pages/bookings";
import { Profile } from "@/pages/profile";
import { BecomeVendor } from "@/pages/become-vendor";
import { Wishlist } from "@/pages/wishlist";
import { Notifications } from "@/pages/notifications";
import { ForgotPassword } from "@/pages/forgot-password";
import { ResetPassword } from "@/pages/reset-password";
import { PaymentResult } from "@/pages/payment-result";
import { Terms } from "@/pages/terms";
import { Privacy } from "@/pages/privacy";
import { City } from "@/pages/city";
import { CitySecondary } from "@/pages/city-secondary";
import {
  VendorSlugRoute,
  EventSlugRoute,
  VendorLegacyRedirect,
  EventLegacyRedirect,
} from "@/pages/slugged-detail-redirect";

// Lazily loaded heavy/role-gated pages
const VendorDashboard = lazy(() => import("@/pages/vendor-dashboard").then((m) => ({ default: m.VendorDashboard })));
const VendorListingEditPage = lazy(() => import("@/pages/vendor-dashboard").then((m) => ({ default: m.VendorListingEditPage })));
const TicketScanner = lazy(() => import("@/pages/ticket-scanner").then((m) => ({ default: m.TicketScanner })));
const AdminPanel = lazy(() => import("@/pages/admin").then((m) => ({ default: m.AdminPanel })));
const Subscription = lazy(() => import("@/pages/subscription").then((m) => ({ default: m.Subscription })));
const Blogs = lazy(() => import("@/pages/blogs").then((m) => ({ default: m.Blogs })));
const BlogDetail = lazy(() => import("@/pages/blog-detail").then((m) => ({ default: m.BlogDetail })));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-32">
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
    if (data.user.role === "vendor" || data.user.role === "admin") {
      setLocation("/dashboard/vendor");
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
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <ScrollToTop />
      <OAuthErrorHandler />
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/explore" component={Explore} />
          <Route path="/pubs" component={Pubs} />
          <Route path="/pub-offers" component={PubOffers} />
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

          {/* SEO-friendly slugged detail URLs (canonical) — redirect to legacy
              detail components which set rel=canonical back to the slug URL. */}
          <Route path="/pubs/:city/:slug" component={VendorSlugRoute} />
          <Route path="/events/:city/:slug" component={EventSlugRoute} />

          {/* Programmatic city / locality / category landing pages.
              These greedy patterns must come AFTER all specific top-level
              routes so they only catch unmatched URLs. */}
          <Route path="/:city/:second" component={CitySecondary} />
          <Route path="/:city" component={City} />

          <Route component={NotFound} />
        </Switch>
        </Suspense>
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
