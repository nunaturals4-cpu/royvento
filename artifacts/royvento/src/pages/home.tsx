import { Link } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Sparkles,
  ShieldCheck,
  Crown,
  Flame,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListFeaturedEvents } from "@workspace/api-client-react";
import { EventCard } from "@/components/EventCard";
import { apiGet, formatINR } from "@/lib/api";

interface PublicEvent {
  id: number;
  title: string;
  category: string;
  type: string;
  location: string;
  city: string;
  state: string;
  price: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  partnerName: string;
  popular: boolean;
}

export function Home() {
  const { data: featured = [] } = useListFeaturedEvents();
  const [popular, setPopular] = useState<PublicEvent[]>([]);
  const [pubs, setPubs] = useState<PublicEvent[]>([]);

  useEffect(() => {
    apiGet<PublicEvent[]>("/api/events/popular").then(setPopular).catch(() => {});
    apiGet<PublicEvent[]>("/api/events?type=pub").then((r) => setPubs(r.slice(0, 6))).catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src="https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=2400&q=80"
            alt=""
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-background" />
          <div className="absolute inset-0 hero-grid opacity-40" />
        </div>
        <div className="container mx-auto px-4 md:px-6 py-32 md:py-44 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full glass-card px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white/80 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              India's premier pub booking platform
            </div>
            <h1 className="font-serif text-5xl md:text-7xl leading-[1.05] tracking-tight">
              India's best pubs,<br />
              <span className="italic text-gradient-red">one booking away.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl leading-relaxed">
              Discover verified pubs and clubs across India's top cities. Book tickets for ladies nights, couple entry, stag passes, and table reservations — all in one place.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/pubs">
                <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground red-glow border-0 h-12 px-7">
                  Browse pubs <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/register">
                <Button size="lg" variant="outline" className="h-12 px-7 border-white/20 hover:bg-white/5">
                  Join for free
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="mt-14 grid grid-cols-3 gap-6 max-w-xl">
              <div>
                <p className="stat-number text-3xl">200+</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Verified pubs</p>
              </div>
              <div>
                <p className="stat-number text-3xl">15K</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Tickets booked</p>
              </div>
              <div>
                <p className="stat-number text-3xl">4.9★</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Avg. rating</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="container mx-auto px-4 md:px-6 py-24">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: ShieldCheck, title: "Verified pubs only", body: "Every pub on Royvento is reviewed and approved by our team. No fake listings, no surprises." },
            { icon: PartyPopper, title: "All entry types covered", body: "Ladies night, couple entry, stag passes, table reservations — book any format in seconds." },
            { icon: Sparkles, title: "Verified reviews", body: "Reviews come from confirmed bookings only — what you read is what you get." },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl glass-card p-7 lift-3d">
              <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-5 red-ring">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-2xl tracking-tight mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Popular section */}
      {popular.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-12">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
                <Flame className="h-3.5 w-3.5" /> Trending right now
              </p>
              <h2 className="font-serif text-3xl md:text-5xl tracking-tight">Popular this season</h2>
            </div>
            <Link href="/explore" className="text-sm text-white/60 hover:text-white hidden md:flex items-center gap-1">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {popular.slice(0, 8).map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {/* Featured events */}
      <section className="container mx-auto px-4 md:px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" /> In the spotlight
            </p>
            <h2 className="font-serif text-3xl md:text-5xl tracking-tight">Featured events</h2>
          </div>
          <Link href="/explore" className="text-sm text-white/60 hover:text-white hidden md:flex items-center gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((e) => <EventCard key={e.id} event={e as any} />)}
        </div>
      </section>

      {/* Pubs */}
      {pubs.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
                <PartyPopper className="h-3.5 w-3.5" /> Nightlife
              </p>
              <h2 className="font-serif text-3xl md:text-5xl tracking-tight">Pubs &amp; lounges</h2>
            </div>
            <Link href="/pubs" className="text-sm text-white/60 hover:text-white hidden md:flex items-center gap-1">
              All pubs <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pubs.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {/* CTA — Premium */}
      <section className="container mx-auto px-4 md:px-6 py-24">
        <div className="relative rounded-[2rem] overflow-hidden glass-card-strong red-glow p-10 md:p-16 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center">
          <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-primary/30 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 border border-primary/40 px-3 py-1 text-xs uppercase tracking-wider text-primary mb-5">
              <Crown className="h-3.5 w-3.5" /> Royvento Premium
            </div>
            <h2 className="font-serif text-3xl md:text-5xl tracking-tight italic leading-tight">
              Host an event <br />people will write home about.
            </h2>
            <p className="mt-5 text-white/70 max-w-xl leading-relaxed">
              Subscribe for early-access drops, members-only pubs, complimentary upgrades, and partner concierge. From {formatINR(200)} for personal hosts and {formatINR(999)} for partners.
            </p>
          </div>
          <div className="relative flex flex-col gap-3">
            <Link href="/subscription">
              <Button size="lg" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 h-12">
                See plans
              </Button>
            </Link>
            <Link href="/dashboard/become-vendor">
              <Button size="lg" variant="outline" className="w-full border-white/20 hover:bg-white/5 h-12">
                Become a partner
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
