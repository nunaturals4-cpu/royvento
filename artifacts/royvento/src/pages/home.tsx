import { Link } from "wouter";
import { ArrowRight, Calendar, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListFeaturedEvents, useListVendors } from "@workspace/api-client-react";
import { EventCard } from "@/components/EventCard";
import { VendorCard } from "@/components/VendorCard";

export function Home() {
  const { data: featured = [] } = useListFeaturedEvents();
  const { data: vendors = [] } = useListVendors();
  const topVendors = vendors.slice(0, 3);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src="https://images.unsplash.com/photo-1519741497674-611481863552?w=2400&q=80"
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background" />
        </div>
        <div className="container mx-auto px-4 md:px-6 py-28 md:py-44 relative">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.25em] text-primary mb-6 font-medium">
              An event marketplace for hosts who notice
            </p>
            <h1 className="font-serif text-5xl md:text-7xl leading-[1.05] tracking-tight text-foreground">
              Heirloom events,<br />
              <span className="italic text-primary">remarkable craft.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              From estate weddings to founder summits and harvest festivals — discover and book the most considered vendors and events in one place.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/explore">
                <Button size="lg" className="gap-2">Explore events <ArrowRight className="h-4 w-4" /></Button>
              </Link>
              <Link href="/vendors">
                <Button size="lg" variant="outline">Browse vendors</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="container mx-auto px-4 md:px-6 py-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Sparkles, title: "Curated, never crowded", body: "Every vendor on Royvento is reviewed and approved by our team before they appear." },
            { icon: Calendar, title: "Real-time availability", body: "See open dates instantly and book without the back-and-forth." },
            { icon: ShieldCheck, title: "Verified reviews", body: "Reviews come from confirmed bookings — no astroturf, no surprises." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-7">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-xl tracking-tight mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured events */}
      <section className="container mx-auto px-4 md:px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">In the spotlight</p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight">Featured events</h2>
          </div>
          <Link href="/explore" className="text-sm text-muted-foreground hover:text-foreground hidden md:flex items-center gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </section>

      {/* Top vendors */}
      <section className="container mx-auto px-4 md:px-6 py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">The makers</p>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight">Vendors of note</h2>
          </div>
          <Link href="/vendors" className="text-sm text-muted-foreground hover:text-foreground hidden md:flex items-center gap-1">
            All vendors <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {topVendors.map((v) => <VendorCard key={v.id} vendor={v} />)}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 md:px-6 py-20">
        <div className="rounded-3xl bg-primary text-primary-foreground p-10 md:p-16 grid md:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div>
            <h2 className="font-serif text-3xl md:text-5xl tracking-tight italic">
              Host an event people will write home about.
            </h2>
            <p className="mt-4 text-primary-foreground/80 max-w-xl leading-relaxed">
              Join Royvento as a host and start booking with the most considered vendors in the country. Or apply to become one.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 md:items-end">
            <Link href="/register"><Button size="lg" variant="secondary" className="w-full md:w-auto">Create an account</Button></Link>
            <Link href="/contact"><Button size="lg" variant="outline" className="w-full md:w-auto bg-transparent border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10">Talk to our team</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
