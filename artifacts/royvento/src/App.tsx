import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AiChatWidget } from "@/components/AiChatWidget";

// Pages
import { Home } from "@/pages/home";
import { Explore } from "@/pages/explore";
import { Pubs } from "@/pages/pubs";
import { Vendors } from "@/pages/vendors";
import { EventDetail } from "@/pages/event-detail";
import { VendorDetail } from "@/pages/vendor-detail";
import { Login } from "@/pages/login";
import { Register } from "@/pages/register";
import { Contact } from "@/pages/contact";
import { VendorDashboard } from "@/pages/vendor-dashboard";
import { TicketScanner } from "@/pages/ticket-scanner";
import { Bookings } from "@/pages/bookings";
import { AdminPanel } from "@/pages/admin";
import { Profile } from "@/pages/profile";
import { BecomeVendor } from "@/pages/become-vendor";
import { Subscription } from "@/pages/subscription";
import { Blogs } from "@/pages/blogs";
import { BlogDetail } from "@/pages/blog-detail";
import { Wishlist } from "@/pages/wishlist";
import { ForgotPassword } from "@/pages/forgot-password";
import { ResetPassword } from "@/pages/reset-password";

import { RequireAuth } from "@/components/RequireAuth";
import { ThemeProvider } from "@/components/ThemeProvider";

const queryClient = new QueryClient();

function OAuthErrorHandler() {
  const { toast } = useToast();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) return;
    if (error === "google_not_configured") {
      toast({ title: "Google sign-in not configured", description: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable.", variant: "destructive" });
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
      <OAuthErrorHandler />
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/explore" component={Explore} />
          <Route path="/pubs" component={Pubs} />
          <Route path="/vendors" component={Vendors} />
          <Route path="/partners" component={Vendors} />
          <Route path="/events/:id" component={EventDetail} />
          <Route path="/vendors/:id" component={VendorDetail} />
          <Route path="/partners/:id" component={VendorDetail} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/contact" component={Contact} />
          <Route path="/subscription" component={Subscription} />
          <Route path="/blogs" component={Blogs} />
          <Route path="/blogs/:slug" component={BlogDetail} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />

          <Route path="/wishlist">
            {() => <RequireAuth><Wishlist /></RequireAuth>}
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
          <Route path="/dashboard/vendor/scanner">
            {() => <RequireAuth role="vendor"><TicketScanner /></RequireAuth>}
          </Route>
          <Route path="/dashboard/bookings">
            {() => <RequireAuth><Bookings /></RequireAuth>}
          </Route>
          <Route path="/admin">
            {() => <RequireAuth role="admin"><AdminPanel /></RequireAuth>}
          </Route>

          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
      <AiChatWidget />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
