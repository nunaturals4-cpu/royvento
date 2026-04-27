import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

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

import { RequireAuth } from "@/components/RequireAuth";
import { ThemeProvider } from "@/components/ThemeProvider";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
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
