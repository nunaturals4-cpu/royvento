import { Link } from "wouter";
import { Flame, Users, ArrowRight, Sparkles } from "lucide-react";
import { SEO } from "@/components/SEO";
import { HappeningTonight } from "@/components/HappeningTonight";
import { GoingOutWithFriends } from "@/components/GoingOutWithFriends";

// ── Tonight Plans ────────────────────────────────────────────────────────────
// One destination that answers "what are we doing tonight?" — pairs the
// real-time "Happening Tonight" feed with the group-first "Going Out With
// Friends" discovery engine under a single hero.

export function TonightPlans() {
  return (
    <div>
      <SEO
        title="Tonight Plans — What's On Near You | Royvento"
        description="Plan tonight in seconds. See what's happening right now and find pubs, clubs, events and gaming venues that can host your whole group — live availability on Royvento."
        canonical="/tonight-plans"
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=1920&q=80"
            alt="Friends out at night"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-black/50" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/25 via-transparent to-transparent mix-blend-screen" />
        </div>

        <div className="container relative mx-auto px-4 md:px-6 py-20 md:py-28">
          <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary">
            <Flame className="h-3.5 w-3.5" /> Real-time night planner
          </p>
          <h1 className="max-w-3xl font-serif text-4xl leading-tight tracking-tight text-white md:text-6xl">
            Tonight Plans
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/70 md:text-lg">
            What's happening right now, and where your whole crew can actually go —
            ranked by live availability. Decide in seconds.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#happening-tonight"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground red-glow transition-transform hover:scale-105"
            >
              <Flame className="h-4 w-4" /> Happening Tonight
            </a>
            <a
              href="#going-out"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              <Users className="h-4 w-4" /> Going Out With Friends
            </a>
          </div>
        </div>
      </section>

      {/* Happening Tonight */}
      <div id="happening-tonight" className="scroll-mt-24">
        <HappeningTonight />
      </div>

      {/* Going Out With Friends */}
      <div id="going-out" className="scroll-mt-24">
        <GoingOutWithFriends />
      </div>

      {/* Footer CTA */}
      <section className="container mx-auto px-4 md:px-6 py-16">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-gradient-to-r from-primary/15 via-zinc-900/60 to-zinc-900/60 p-8 text-center md:p-12">
          <Sparkles className="h-8 w-8 text-primary" />
          <h2 className="font-serif text-2xl tracking-tight text-white md:text-3xl">
            Still deciding? Browse every pub & club
          </h2>
          <Link
            href="/pubs"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground red-glow"
          >
            Explore all venues <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
