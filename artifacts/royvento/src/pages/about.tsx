import { Link } from "wouter";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Ticket,
  Gamepad2,
  GlassWater,
  Users,
  PartyPopper,
  Heart,
  Store,
  TrendingUp,
  Wallet,
  BarChart3,
  CheckCircle2,
  Coins,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetMe } from "@workspace/api-client-react";
import { SEO, buildFAQPage, buildBreadcrumbList } from "@/components/SEO";

const FAQS: { question: string; answer: string }[] = [
  {
    question: "What is Royvento?",
    answer:
      "Royvento is India's premium discovery and booking platform for going out — pubs and clubs, ticketed events, games and sports venues, private parties and verified social groups. Users find and book the best nights out; partners fill their venues and events and get paid seamlessly.",
  },
  {
    question: "Is Royvento free to use?",
    answer:
      "Yes. Browsing, discovering and booking on Royvento is free for users. You only pay for the tickets, tables or experiences you choose to book, plus any applicable charges shown transparently at checkout.",
  },
  {
    question: "How do I earn money on Royvento?",
    answer:
      "If you run a pub, club, event, gaming venue, or you're a creator or host, you can list on Royvento and earn from ticket sales, table and game bookings, packages and offers. Everyday users can earn loyalty rewards, referral perks and can even host their own ticketed parties.",
  },
  {
    question: "How do partner payouts work?",
    answer:
      "Royvento collects payments securely on your behalf and settles them to your registered bank account or UPI, net of our commission. You track every booking, ticket sale and payout in real time from your partner dashboard.",
  },
  {
    question: "How do I become a partner?",
    answer:
      "Tap ‘Become a Partner', pick your category — pub/club, event organizer or game organizer — and complete a short onboarding. Once your listing is verified it goes live and starts accepting bookings.",
  },
  {
    question: "Is Royvento safe and verified?",
    answer:
      "Yes. Partners are verified before going live, payments run over encrypted, secure channels, and our Solo Connect groups add live selfie and phone verification. We're committed to trustworthy experiences for both users and partners.",
  },
];

const SERVICES: { icon: typeof Ticket; title: string; desc: string; href: string }[] = [
  {
    icon: GlassWater,
    title: "Pubs & Clubs",
    desc: "Discover rooftop bars, microbreweries and nightclubs. Book tables, unlock exclusive food & drink offers and skip the guesswork.",
    href: "/pubs",
  },
  {
    icon: Ticket,
    title: "Events",
    desc: "From live music and comedy to curated nights out — browse and book tickets to the experiences everyone's talking about.",
    href: "/events",
  },
  {
    icon: Gamepad2,
    title: "Games & Sports",
    desc: "Book gaming lounges, arcades, turfs and sports venues by the hour, the table or the package — instantly.",
    href: "/games",
  },
  {
    icon: PartyPopper,
    title: "Private Parties",
    desc: "Host your own ticketed party or join one nearby. Set the vibe, sell entry and manage guests, all in one place.",
    href: "/private-parties",
  },
  {
    icon: Heart,
    title: "Solo Connect",
    desc: "Premium, verified, same-city activity groups for meeting like-minded people around real-world plans — safely.",
    href: "/solo-connect",
  },
  {
    icon: Sparkles,
    title: "Offers & Rewards",
    desc: "Hand-picked deals, membership perks and loyalty points that turn every night out into more value.",
    href: "/pub-offers",
  },
];

const EARN: { icon: typeof Ticket; title: string; desc: string }[] = [
  {
    icon: Megaphone,
    title: "Event Organizers",
    desc: "Publish events, sell tickets in minutes and reach a ready audience of people looking for their next plan. Track sales live and get paid on time.",
  },
  {
    icon: Gamepad2,
    title: "Game Organizers",
    desc: "List your gaming or sports venue with flexible pricing and packages. Fill idle slots, take bookings around the clock and grow repeat play.",
  },
  {
    icon: GlassWater,
    title: "Pubs & Clubs",
    desc: "Turn quiet nights into full houses. Drive table bookings, promote offers and build loyalty — while we handle payments and discovery.",
  },
  {
    icon: Store,
    title: "Creators & Hosts",
    desc: "Build a following, host your own parties and experiences, and monetize your community with ticketed events and collaborations.",
  },
  {
    icon: Coins,
    title: "Everyday Users",
    desc: "Earn loyalty points and referral rewards as you book, and unlock the option to host your own ticketed parties to earn from your circle.",
  },
];

const TRUST: { icon: typeof ShieldCheck; title: string; desc: string }[] = [
  {
    icon: ShieldCheck,
    title: "Verified Partners",
    desc: "Every venue and organizer is reviewed before going live, so you can book with confidence.",
  },
  {
    icon: Wallet,
    title: "Secure Payments & Payouts",
    desc: "Encrypted checkout for users and transparent, on-time settlements for partners.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Dashboards",
    desc: "Partners see bookings, ticket sales, ratings and payouts update the moment they happen.",
  },
  {
    icon: TrendingUp,
    title: "Built to Grow You",
    desc: "Smart discovery puts your listings in front of the right audience in the right city.",
  },
];

export function About() {
  const { data: me } = useGetMe();
  const user = me?.user;
  // Existing partners already have a listing, so send them to their dashboard
  // instead of a sign-up/onboarding flow. Logged-in regular users go straight to
  // the Become-a-Partner form; only logged-out visitors see sign-up.
  const isPartner = !!user && ["vendor", "organizer", "game_organizer", "admin"].includes(user.role);
  const partnerHref = !user ? "/register" : isPartner ? "/dashboard" : "/dashboard/become-vendor";
  const partnerLabel = isPartner ? "Go to Dashboard" : "Become a Partner";
  // Generic primary CTA: logged-out visitors sign up; logged-in users explore.
  const primaryCta = user
    ? { href: "/pubs", label: "Explore Royvento" }
    : { href: "/register", label: "Get Started" };

  return (
    <div className="pb-8">
      <SEO
        title="About Us | Royvento"
        description="Royvento is India's premium platform to discover and book the best nights out — pubs, events, games, private parties and verified social groups. Learn who we are, what we do, our mission, and how event organizers, game organizers, pubs, creators and users earn on Royvento."
        canonical="/about"
        jsonLd={[
          buildBreadcrumbList([
            { name: "Home", url: "/" },
            { name: "About Us", url: "/about" },
          ]),
          buildFAQPage(FAQS),
        ]}
      />

      {/* Hero */}
      <section className="container mx-auto px-4 md:px-6 pt-16 md:pt-24 pb-12 max-w-4xl text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-primary/90 mb-4">About Royvento</p>
        <h1 className="font-serif text-4xl md:text-6xl font-bold leading-[1.05] mb-6">
          Where great nights out begin.
        </h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-8">
          Royvento is the premium platform that connects people to unforgettable experiences — and connects
          venues, organizers and creators to the audiences who love them. Discover, book and host pubs, events,
          games, parties and verified social groups, all in one beautifully simple place.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <Button asChild size="lg">
            <Link href="/pubs">
              Explore Royvento <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={partnerHref}>{partnerLabel}</Link>
          </Button>
        </div>
      </section>

      {/* Who we are */}
      <section className="container mx-auto px-4 md:px-6 py-12 max-w-3xl">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Who We Are</p>
        <h2 className="font-serif text-3xl font-bold mb-4">One platform for everything worth going out for.</h2>
        <div className="space-y-4 text-muted-foreground leading-8">
          <p>
            Royvento was built on a simple belief: finding and booking a great experience should feel as good as the
            experience itself. We bring together the best pubs, clubs, events, gaming venues, parties and communities
            across India — and make them discoverable, bookable and rewarding in a few taps.
          </p>
          <p>
            For the businesses and creators behind those experiences, Royvento is a growth engine — a place to reach
            new customers, fill seats and slots, sell tickets, and get paid without the operational headaches.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="container mx-auto px-4 md:px-6 py-12 max-w-4xl">
        <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur p-8 md:p-12 text-center">
          <Sparkles className="h-6 w-6 text-primary mx-auto mb-4" />
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Our Mission</p>
          <p className="font-serif text-2xl md:text-3xl font-semibold leading-snug max-w-3xl mx-auto">
            To make every night out effortless to discover, delightful to book, and profitable to host — while raising
            the standard for trust in going out.
          </p>
        </div>
      </section>

      {/* What we do / services */}
      <section className="container mx-auto px-4 md:px-6 py-12 max-w-5xl">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">What We Do</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">The Royvento ecosystem</h2>
          <p className="text-muted-foreground leading-7">
            Everything you need to plan, book and host — under one premium roof.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICES.map(({ icon: Icon, title, desc, href }) => (
            <Link
              key={title}
              href={href}
              className="group rounded-2xl border border-border/60 bg-black/40 backdrop-blur p-6 transition-colors hover:border-primary/40"
            >
              <div className="h-11 w-11 rounded-xl border border-border/60 flex items-center justify-center mb-4 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-6">{desc}</p>
              <span className="inline-flex items-center gap-1 text-sm text-primary mt-4 group-hover:gap-2 transition-all">
                Explore <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Ways to earn */}
      <section className="container mx-auto px-4 md:px-6 py-12 max-w-5xl">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Earn With Royvento</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">Turn your venue, events or community into income.</h2>
          <p className="text-muted-foreground leading-7">
            Whether you run a venue, organize events or build an audience, Royvento gives you the tools, the reach and
            the payments to grow. Here's how different partners earn.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EARN.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur p-6 flex gap-4"
            >
              <div className="h-11 w-11 shrink-0 rounded-xl border border-border/60 flex items-center justify-center text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground leading-6">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
          <Button asChild size="lg">
            <Link href={partnerHref}>
              {isPartner ? "Go to Dashboard" : "Start Earning"} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/contact">Talk to Our Team</Link>
          </Button>
        </div>
      </section>

      {/* Trust */}
      <section className="container mx-auto px-4 md:px-6 py-12 max-w-5xl">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Why Royvento</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-3">Trust built into every booking.</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TRUST.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur p-6">
              <Icon className="h-6 w-6 text-primary mb-4" />
              <h3 className="font-semibold text-base mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-6">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container mx-auto px-4 md:px-6 py-12 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur p-8">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">For Users</p>
            <ul className="space-y-4">
              {[
                "Discover pubs, events, games and parties in your city.",
                "Book tickets or tables in a few taps with secure checkout.",
                "Show up, enjoy, and earn loyalty rewards along the way.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-muted-foreground leading-6">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/pubs">Start Exploring</Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur p-8">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">For Partners</p>
            <ul className="space-y-4">
              {[
                "Sign up and list your venue, events or experiences.",
                "Get verified and go live to a ready-to-book audience.",
                "Accept bookings, track performance and get paid on time.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-muted-foreground leading-6">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6">
              <Link href={partnerHref}>{partnerLabel}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-4 md:px-6 py-12 max-w-3xl">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">FAQs</p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold">Questions, answered.</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-2xl border border-border/60 bg-black/40 backdrop-blur p-5"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-medium">
                <span>{faq.question}</span>
                <ArrowRight className="h-4 w-4 text-primary shrink-0 transition-transform group-open:rotate-90" />
              </summary>
              <p className="text-sm text-muted-foreground leading-7 mt-3">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 md:px-6 py-12 max-w-5xl">
        <div className="rounded-2xl border border-primary/30 bg-black/40 backdrop-blur p-8 md:p-14 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">Your next great night out — or your next big listing — starts here.</h2>
          <p className="text-muted-foreground max-w-xl mx-auto leading-7 mb-8">
            Join thousands of people discovering, booking and hosting on Royvento. It's free to get started.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href={primaryCta.href}>
                {primaryCta.label} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Contact Us</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
