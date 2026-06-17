import { useState } from "react";
import { Link } from "wouter";
import { useGetSoloAccess, useGetMe, useListSoloGroups, type SoloGroup } from "@workspace/api-client-react";
import { useSelectedCity } from "@/components/LocationContext";
import { SEO } from "@/components/SEO";
import { Spinner } from "@/components/ui/spinner";
import { SoloVerificationFlow } from "@/components/solo-connect/SoloVerificationFlow";
import { CreateGroupModal } from "@/components/solo-connect/CreateGroupModal";
import { SoloGroupDetail } from "@/components/solo-connect/SoloGroupDetail";
import {
  Crown,
  ShieldCheck,
  MapPin,
  Users,
  Plus,
  Lock,
  Navigation,
  ArrowRight,
  AlertTriangle,
  Music,
  Wine,
  Utensils,
  CalendarDays,
  Gamepad2,
  Trophy,
  LogIn,
  UserPlus,
  Smartphone,
  Camera,
  Flag,
  MessageCircle,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";

const ACTIVITY_FILTERS = [
  { value: "", label: "All" },
  { value: "nightlife", label: "Nightlife" },
  { value: "happy_hours", label: "Happy Hours" },
  { value: "food_drinks", label: "Food & Drinks" },
  { value: "events", label: "Events" },
  { value: "games", label: "Games" },
  { value: "activities", label: "Activities" },
];

// Per-activity accent hue — gives the cards/chips warm variety while the page
// stays anchored in the gold/red brand.
const ACTIVITY_ACCENT: Record<string, string> = {
  nightlife: "#a78bfa",
  happy_hours: "#fbbf24",
  food_drinks: "#fb7185",
  events: "#60a5fa",
  games: "#34d399",
  activities: "#fb923c",
};
const accentOf = (a: string) => ACTIVITY_ACCENT[a] ?? GOLD;
const prettyActivity = (a: string) => a.replace(/_/g, " ");

// Ordered activity sections — each renders as its own labelled block so the
// list is browsable by category, not one undifferentiated grid.
const ACTIVITY_SECTIONS = [
  { value: "nightlife", label: "Nightlife", blurb: "Pub crawls, DJ nights & late hangouts", icon: Music },
  { value: "happy_hours", label: "Happy Hours", blurb: "Catch the best drink deals together", icon: Wine },
  { value: "food_drinks", label: "Food & Drinks", blurb: "Dining out & bar bites with company", icon: Utensils },
  { value: "events", label: "Events", blurb: "Concerts, comedy & live shows", icon: CalendarDays },
  { value: "games", label: "Games", blurb: "Bowling, VR, arcade & more", icon: Gamepad2 },
  { value: "activities", label: "Activities", blurb: "Sports screenings, trivia & meetups", icon: Trophy },
] as const;

// Hero visual — group of friends socializing, fits Solo Connect concept.
const HERO_IMAGE = "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=80";

export function SoloConnect() {
  // Solo Connect is now a PUBLIC page: logged-out visitors see a showcase that
  // explains the product, the perks, and the safety/verification flow, with a
  // clear "login first" call to action. Only authenticated users hit the
  // eligibility/verification gates below.
  const { data: me, isLoading: meLoading } = useGetMe({ query: { retry: false } as any });
  const loggedIn = !!me?.user;
  const { data: access, isLoading: accessLoading } = useGetSoloAccess({
    query: { enabled: loggedIn, retry: false } as any,
  });
  // Lifted so the hero filter bar drives the group list below.
  const [activity, setActivity] = useState("");

  const loading = meLoading || (loggedIn && accessLoading);

  return (
    <>
      <SEO title="Solo Connect | Royvento" noindex />
      <div className="relative min-h-[80vh] overflow-hidden bg-background">
        {/* Ambient warm glow field */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-20 h-[420px] w-[720px] rounded-full blur-[120px] opacity-45"
            style={{ background: `radial-gradient(ellipse at center, ${RED}40, transparent 70%)` }} />
          <div className="absolute top-20 right-0 h-72 w-72 rounded-full blur-[110px] opacity-25"
            style={{ background: `radial-gradient(circle, ${GOLD}33, transparent 70%)` }} />
        </div>

        <div className="relative container mx-auto px-4 md:px-6 pt-12 md:pt-14 pb-24">
          {/* Compact heading above hero */}
          <CompactHeading />

          {/* Hero section: left banner + filters · right misuse warning */}
          <HeroSection activity={activity} setActivity={setActivity} />

          {/* Gated content */}
          <div className="mt-8">
            {loading ? (
              <div className="py-24 flex justify-center"><Spinner /></div>
            ) : !loggedIn ? (
              <LoggedOutShowcase />
            ) : !access?.eligible ? (
              <PremiumGate />
            ) : access.verificationStatus !== "approved" ? (
              <SoloVerificationFlow />
            ) : (
              <ApprovedExperience gender={access.gender ?? null} activity={activity} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function CompactHeading() {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.18em]"
          style={{ background: `${GOLD}14`, color: GOLD, border: `1px solid ${GOLD}40` }}
        >
          <Crown className="h-3 w-3" /> Premium · Verified
        </span>
        <h1
          className="font-serif text-3xl md:text-4xl tracking-tight leading-none"
          style={{
            background: "linear-gradient(180deg, #ffffff 0%, #e7d9b4 130%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Solo Connect
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {[
          { icon: ShieldCheck, label: "Selfie-verified members" },
          { icon: Users, label: "Open to everyone" },
          { icon: MapPin, label: "Your city only" },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function HeroSection({ activity, setActivity }: { activity: string; setActivity: (v: string) => void }) {
  return (
    <div className="grid lg:grid-cols-3 gap-4 md:gap-5 mt-9">
      {/* Hero banner (with image) + filters */}
      <div
        className="lg:col-span-2 relative overflow-hidden rounded-3xl p-6 md:p-7 min-h-[260px] flex flex-col justify-end"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Relatable background image */}
        <img
          src={HERO_IMAGE}
          alt="Friends out together"
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
        {/* Readability + brand-warmth overlays */}
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.88) 60%, rgba(0,0,0,0.96) 100%)" }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(115deg, ${RED}33, transparent 55%, ${GOLD}18)` }} />
        <div className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full blur-3xl opacity-40" style={{ background: `${GOLD}30` }} />

        <div className="relative">
          <h2 className="font-serif text-2xl md:text-3xl leading-snug mb-1.5" style={{ color: "#fff" }}>
            Find your people, by the vibe.
          </h2>
          <p className="text-sm mb-5 max-w-md" style={{ color: "rgba(255,255,255,0.75)" }}>
            Pick a category and browse verified groups happening in your city.
          </p>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
          {ACTIVITY_FILTERS.map((f) => {
            const active = activity === f.value;
            const accent = f.value ? accentOf(f.value) : GOLD;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setActivity(f.value)}
                className="px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all"
                style={{
                  background: active ? `${accent}26` : "rgba(255,255,255,0.05)",
                  color: active ? "#fff" : "rgba(255,255,255,0.65)",
                  border: active ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.1)",
                  boxShadow: active ? `0 0 16px ${accent}33` : "none",
                }}
              >
                {f.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Right side — misuse warning */}
      <MisuseWarning />
    </div>
  );
}

function MisuseWarning() {
  return (
    <aside
      className="relative overflow-hidden rounded-3xl p-5 md:p-6"
      style={{
        background: "linear-gradient(180deg, rgba(185,28,28,0.14), rgba(20,14,14,0.92))",
        border: `1px solid ${RED}44`,
        boxShadow: `0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span className="flex items-center justify-center h-9 w-9 rounded-xl shrink-0"
          style={{ background: `${RED}26`, border: `1px solid ${RED}66`, boxShadow: `0 0 18px ${RED}33` }}>
          <AlertTriangle className="h-4.5 w-4.5" style={{ color: "#fca5a5" }} />
        </span>
        <h3 className="font-serif text-lg" style={{ color: "#fff" }}>Zero-tolerance policy</h3>
      </div>
      <p className="text-[13px] leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.66)" }}>
        Solo Connect is strictly monitored for everyone's safety. Misusing it has real consequences.
      </p>
      <ul className="space-y-1.5 mb-4">
        {["Harassment or abuse", "Fake identity or impersonation", "Spam or solicitation", "Any unsafe behaviour"].map((x) => (
          <li key={x} className="flex items-start gap-2 text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ background: "#fca5a5" }} />
            {x}
          </li>
        ))}
      </ul>
      <div className="rounded-xl px-3 py-2.5 text-[12px] leading-snug"
        style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
        Report any member in one tap. Our team reviews every report and can <span style={{ color: "#fca5a5", fontWeight: 600 }}>warn, suspend, or ban</span> offenders.
        Always report anyone who makes you uncomfortable.
      </div>
    </aside>
  );
}

// Shared premium glass surface for the gate cards.
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative max-w-md mx-auto rounded-3xl overflow-hidden ${className}`}
      style={{
        background: "linear-gradient(180deg, rgba(24,22,26,0.92), rgba(14,13,16,0.92))",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `0 30px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px ${GOLD}10`,
        backdropFilter: "blur(24px)",
      }}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      {children}
    </div>
  );
}

// Where login should return the visitor once authenticated.
const LOGIN_NEXT = `/login?next=${encodeURIComponent("/solo-connect")}`;
const SIGNUP_NEXT = "/register";

// Perks shown to logged-out visitors — the "what you get when you join" grid.
const SHOWCASE_FEATURES = [
  {
    icon: ShieldCheck,
    accent: "#4ade80",
    title: "Phone & selfie verified",
    body: "Every member verifies their mobile number and takes a live selfie, so you only ever meet real, verified people.",
  },
  {
    icon: Users,
    accent: "#a78bfa",
    title: "Open to everyone",
    body: "Anyone can join any group — men and women together. Each group card shows its makeup (👨/👩) so you always know who's in.",
  },
  {
    icon: MapPin,
    accent: "#fb7185",
    title: "People in your city",
    body: "You only see groups happening in your current city, so every plan is genuinely within reach.",
  },
  {
    icon: CalendarDays,
    accent: "#60a5fa",
    title: "Six ways to hang out",
    body: "Nightlife, happy hours, food & drinks, events, games and activities — pick whatever fits your vibe.",
  },
  {
    icon: MessageCircle,
    accent: GOLD,
    title: "Private group chat",
    body: "Coordinate the plan inside a temporary group chat that's auto-cleared daily. Inactive groups are removed after 15 days.",
  },
  {
    icon: Flag,
    accent: "#fbbf24",
    title: "Report & stay safe",
    body: "Report any member in one tap. Our team reviews every report and can warn, suspend, or ban — backed by a zero-tolerance policy.",
  },
] as const;

// The end-to-end journey, rendered as a visual flow diagram.
const FLOW_STEPS = [
  { icon: LogIn, label: "Log in", sub: "Sign in or create your free account" },
  { icon: Crown, label: "Go Premium", sub: "Unlock Solo Connect with Royvento Premium" },
  { icon: Smartphone, label: "Verify phone", sub: "Confirm your mobile number with an OTP" },
  { icon: Camera, label: "Selfie + consent", sub: "Take a live selfie, pick gender, accept the terms" },
  { icon: Users, label: "Join groups", sub: "Get approved, then browse & meet up in your city" },
] as const;

function LoggedOutShowcase() {
  return (
    <div className="space-y-10">
      {/* ── Login-first call to action ───────────────────────────────── */}
      <GlassCard className="!max-w-3xl p-8 md:p-10 text-center">
        <span
          className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-5"
          style={{ background: `linear-gradient(145deg, ${GOLD}26, ${RED}1a)`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 30px ${GOLD}22` }}
        >
          <Lock className="h-7 w-7" style={{ color: GOLD }} />
        </span>
        <h3 className="font-serif text-2xl md:text-3xl mb-2" style={{ color: "#fff" }}>
          Please log in first to join Solo Connect
        </h3>
        <p className="text-sm md:text-base mb-7 leading-relaxed max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.62)" }}>
          Solo Connect is a verified, members-only space. Log in to your Royvento account to unlock it —
          here's exactly what you get and how it works.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={LOGIN_NEXT}
            className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 30px ${RED}4d` }}
          >
            <LogIn className="h-4 w-4" /> Log in to continue
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href={SIGNUP_NEXT}
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: `1px solid ${GOLD}55` }}
          >
            <UserPlus className="h-4 w-4" style={{ color: GOLD }} /> Create an account
          </Link>
        </div>
      </GlassCard>

      {/* ── Features: what you get when you join ─────────────────────── */}
      <section>
        <SectionTitle
          eyebrow="Why join"
          title="What you get when you join"
          subtitle="A premium, safety-first way to meet verified people for real plans in your city."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHOWCASE_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="relative p-5 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: "linear-gradient(180deg, rgba(24,22,26,0.92), rgba(13,12,15,0.92))",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 10px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                <span className="absolute top-0 left-0 right-0 h-px opacity-60"
                  style={{ background: `linear-gradient(90deg, transparent, ${f.accent}, transparent)` }} />
                <span className="flex items-center justify-center h-11 w-11 rounded-2xl mb-3.5"
                  style={{ background: `${f.accent}1a`, border: `1px solid ${f.accent}44`, boxShadow: `0 0 22px ${f.accent}1f` }}>
                  <Icon className="h-5 w-5" style={{ color: f.accent }} />
                </span>
                <h4 className="font-serif text-lg mb-1.5" style={{ color: "#fff" }}>{f.title}</h4>
                <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.58)" }}>{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Flow diagram: how it works ───────────────────────────────── */}
      <section>
        <SectionTitle
          eyebrow="The journey"
          title="How Solo Connect works"
          subtitle="Five simple steps from sign-in to meeting your group — designed around trust and safety."
        />
        <FlowDiagram />
      </section>

      {/* ── Verification explainer ───────────────────────────────────── */}
      <section>
        <SectionTitle
          eyebrow="Steps 3–4 · Safety"
          title="Quick, phone-first verification"
          subtitle="No documents to upload — just your phone, a live selfie, and your consent."
        />
        <VerificationPreview />
      </section>
    </div>
  );
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="text-center mb-6 max-w-2xl mx-auto">
      <span className="inline-block text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: GOLD }}>{eyebrow}</span>
      <h3 className="font-serif text-2xl md:text-3xl mb-2" style={{ color: "#fff" }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{subtitle}</p>
    </div>
  );
}

function FlowDiagram() {
  return (
    <div
      className="relative rounded-3xl p-6 md:p-8"
      style={{
        background: "linear-gradient(180deg, rgba(24,22,26,0.9), rgba(13,12,15,0.9))",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* Desktop: horizontal · Mobile: vertical. Connectors adapt direction. */}
      <ol className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-0">
        {FLOW_STEPS.map((s, i) => {
          const Icon = s.icon;
          const last = i === FLOW_STEPS.length - 1;
          return (
            <li key={s.label} className="flex md:flex-1 md:flex-col items-center md:text-center gap-3 md:gap-0">
              {/* Node */}
              <div className="flex md:flex-col items-center gap-3 md:gap-2 md:w-full">
                <div className="relative shrink-0">
                  <span
                    className="flex items-center justify-center h-12 w-12 rounded-2xl"
                    style={{ background: `linear-gradient(145deg, ${GOLD}26, ${RED}1a)`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 22px ${GOLD}22` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: GOLD }} />
                  </span>
                  <span
                    className="absolute -top-1.5 -left-1.5 flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold"
                    style={{ background: RED, color: "#fff", boxShadow: `0 0 10px ${RED}88` }}
                  >
                    {i + 1}
                  </span>
                </div>
                <div className="md:mt-2">
                  <p className="font-semibold text-sm leading-tight" style={{ color: "#fff" }}>{s.label}</p>
                  <p className="text-[12px] leading-snug mt-0.5 md:px-2" style={{ color: "rgba(255,255,255,0.5)" }}>{s.sub}</p>
                </div>
              </div>

              {/* Connector (between nodes only) */}
              {!last && (
                <div className="flex items-center justify-center md:w-full md:py-0 self-stretch md:self-auto md:order-none">
                  {/* down arrow on mobile, right arrow on desktop */}
                  <ChevronRight className="hidden md:block h-5 w-5 mx-auto" style={{ color: `${GOLD}88` }} />
                  <ChevronRight className="md:hidden h-5 w-5 rotate-90 ml-[18px] my-1" style={{ color: `${GOLD}88` }} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function VerificationPreview() {
  return (
    <div className="grid lg:grid-cols-2 gap-4 md:gap-5 items-stretch">
      {/* Left: what to expect on the verification page */}
      <div
        className="relative rounded-3xl p-6 md:p-7 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(24,22,26,0.94), rgba(13,12,15,0.94))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center h-11 w-11 rounded-2xl shrink-0"
            style={{ background: `linear-gradient(145deg, ${GOLD}26, ${RED}1a)`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 24px ${GOLD}1f` }}>
            <Smartphone className="h-5 w-5" style={{ color: GOLD }} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: GOLD }}>Verification</p>
            <h4 className="font-serif text-xl" style={{ color: "#fff" }}>Phone, selfie & consent</h4>
          </div>
        </div>
        <p className="text-sm leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.6)" }}>
          After logging in and upgrading, you'll verify your mobile number with a one-time code, capture a
          live selfie, choose your gender, and accept the terms. Our team reviews it and unlocks your access.
        </p>
        <p className="text-xs mb-2.5" style={{ color: "rgba(255,255,255,0.55)" }}>What you'll do</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { icon: Smartphone, label: "Mobile OTP" },
            { icon: Camera, label: "Live selfie" },
            { icon: Users, label: "Gender" },
            { icon: ShieldCheck, label: "Consent" },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${GOLD}33`, color: "rgba(255,255,255,0.75)" }}>
              <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} /> {label}
            </span>
          ))}
        </div>
        <ul className="space-y-2.5">
          {[
            "No documents to upload — phone + live selfie only",
            "Selfie reviewed by our safety team, never shown to other members",
            "Capture is live-only — gallery uploads aren't accepted",
          ].map((x) => (
            <li key={x} className="flex items-start gap-2.5 text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#4ade80" }} /> {x}
            </li>
          ))}
        </ul>
      </div>

      {/* Right: mock of the verification flow (visual preview, non-interactive) */}
      <div
        className="relative rounded-3xl p-6 md:p-7 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(20,18,22,0.96), rgba(10,9,12,0.96))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck className="h-4 w-4" style={{ color: GOLD }} />
          <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: GOLD }}>Preview</span>
        </div>

        {/* Faux phone field */}
        <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Mobile number</p>
        <div className="flex items-center justify-between px-4 py-3 rounded-lg mb-4"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${GOLD}44`, color: "#fff" }}>
          <span className="text-sm">+91 90000 00000</span>
          <Smartphone className="h-4 w-4" style={{ color: GOLD }} />
        </div>

        {/* Faux OTP */}
        <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>One-time code</p>
        <div className="px-4 py-3 rounded-lg mb-4 text-sm text-center tracking-[0.4em]"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.4)" }}>
          • • • • • •
        </div>

        {/* Faux selfie capture */}
        <div className="flex items-center gap-3 p-3.5 rounded-xl mb-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <span className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GOLD}44` }}>
            <Camera className="h-4 w-4" style={{ color: GOLD }} />
          </span>
          <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
            Take a live selfie — camera only, no gallery.
          </span>
        </div>

        {/* CTA mirrors real flow → goes to login */}
        <Link
          href={LOGIN_NEXT}
          className="group flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 28px ${RED}4d` }}
        >
          Log in to get verified
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function PremiumGate() {
  return (
    <GlassCard className="p-8 text-center">
      <span
        className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-5"
        style={{ background: `linear-gradient(145deg, ${GOLD}26, ${RED}1a)`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 30px ${GOLD}22` }}
      >
        <Crown className="h-7 w-7" style={{ color: GOLD }} />
      </span>
      <h3 className="font-serif text-2xl mb-2" style={{ color: "#fff" }}>A premium experience</h3>
      <p className="text-sm mb-7 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
        Upgrade to Royvento Premium to unlock Solo Connect and meet verified people for real plans.
      </p>
      <Link
        href="/subscription?plan=user_vip"
        className="group inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
        style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 30px ${RED}4d` }}
      >
        Upgrade to Premium
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </GlassCard>
  );
}

function ApprovedExperience({ gender, activity }: { gender: string | null; activity: string }) {
  const { selectedCity, detectLocation, detecting, locationError } = useSelectedCity();
  const [showCreate, setShowCreate] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<number | null>(null);

  // Location gate — a verified city is required before any group is shown.
  if (!selectedCity) {
    return (
      <GlassCard className="p-8 text-center">
        <span className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-5"
          style={{ background: `linear-gradient(145deg, ${RED}26, ${GOLD}14)`, border: `1px solid ${RED}55`, boxShadow: `0 0 30px ${RED}26` }}>
          <Navigation className="h-7 w-7" style={{ color: GOLD }} />
        </span>
        <h3 className="font-serif text-2xl mb-2" style={{ color: "#fff" }}>Enable your location</h3>
        <p className="text-sm mb-7 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
          Solo Connect only shows groups in your current city. Share your location to continue.
        </p>
        <button
          type="button"
          onClick={() => void detectLocation()}
          disabled={detecting}
          className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 30px ${RED}4d`, opacity: detecting ? 0.7 : 1 }}
        >
          {detecting ? "Detecting…" : "Detect my location"}
        </button>
        {locationError && <p className="text-xs mt-3" style={{ color: "#fca5a5" }}>{locationError}</p>}
      </GlassCard>
    );
  }

  return (
    <div className="w-full">
      {/* Verified + location banner */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 p-4 md:px-5 rounded-2xl mb-6"
        style={{
          background: "linear-gradient(180deg, rgba(24,22,26,0.9), rgba(14,13,16,0.9))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
            <ShieldCheck className="h-3.5 w-3.5" /> Verified
          </span>
          <span className="inline-flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.78)" }}>
            <MapPin className="h-4 w-4" style={{ color: GOLD }} /> {selectedCity}
          </span>
          <span className="inline-flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.78)" }}>
            <Users className="h-4 w-4" style={{ color: GOLD }} /> All groups
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 8px 22px ${RED}40` }}
        >
          <Plus className="h-4 w-4" /> Create group
        </button>
      </div>

      <GroupList city={selectedCity} activity={activity} onOpen={setOpenGroupId} />

      {showCreate && (
        <CreateGroupModal city={selectedCity} onClose={() => setShowCreate(false)} />
      )}
      {openGroupId !== null && (
        <SoloGroupDetail groupId={openGroupId} city={selectedCity} onClose={() => setOpenGroupId(null)} />
      )}
    </div>
  );
}

function GroupList({
  city,
  activity,
  onOpen,
}: {
  city: string;
  activity: string;
  onOpen: (id: number) => void;
}) {
  // Fetch all of the user's gender+city groups once, then split into per-activity
  // sections client-side. The hero filter just narrows which sections show.
  const { data: groups, isLoading } = useListSoloGroups({ city });

  if (isLoading) {
    return <div className="py-16 flex justify-center"><Spinner /></div>;
  }
  if (!groups || groups.length === 0) {
    return (
      <GlassCard className="py-14 px-8 text-center">
        <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
          style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}33` }}>
          <Users className="h-6 w-6" style={{ color: GOLD }} />
        </span>
        <p className="font-serif text-xl mb-1" style={{ color: "#fff" }}>No groups yet in {city}</p>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          Be the first to start one — tap <span style={{ color: GOLD }}>Create group</span> above.
        </p>
      </GlassCard>
    );
  }

  const byType: Record<string, SoloGroup[]> = {};
  for (const g of groups) (byType[g.activityType] ??= []).push(g);

  // When a filter is active, show just that section; otherwise show every
  // category that has at least one group, in a fixed, readable order.
  const sections = activity
    ? ACTIVITY_SECTIONS.filter((s) => s.value === activity)
    : ACTIVITY_SECTIONS.filter((s) => (byType[s.value]?.length ?? 0) > 0);

  return (
    <div className="space-y-9">
      {sections.map((s) => {
        const list = byType[s.value] ?? [];
        const accent = accentOf(s.value);
        const Icon = s.icon;
        return (
          <section key={s.value}>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center h-11 w-11 rounded-2xl shrink-0"
                style={{ background: `${accent}1a`, border: `1px solid ${accent}44`, boxShadow: `0 0 22px ${accent}1f` }}>
                <Icon className="h-5 w-5" style={{ color: accent }} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-xl leading-none" style={{ color: "#fff" }}>{s.label}</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}40` }}>{list.length}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>{s.blurb}</p>
              </div>
              <span className="hidden sm:block flex-1 h-px ml-2" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.1), transparent)" }} />
            </div>

            {list.length === 0 ? (
              <div className="rounded-2xl px-5 py-8 text-center text-sm"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }}>
                No {s.label} groups yet in {city}. Be the first — tap <span style={{ color: GOLD }}>Create group</span>.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((g) => <GroupCard key={g.id} g={g} onOpen={onOpen} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function GroupCard({ g, onOpen }: { g: SoloGroup; onOpen: (id: number) => void }) {
  const accent = accentOf(g.activityType);
  const full = g.memberCount >= g.maxMembers;
  return (
    <button
      type="button"
      onClick={() => onOpen(g.id)}
      className="group relative text-left p-5 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{
        background: "linear-gradient(180deg, rgba(24,22,26,0.92), rgba(13,12,15,0.92))",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 10px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <span className="absolute top-0 left-0 right-0 h-px opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <span className="pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `${accent}33` }} />

      <div className="flex items-center justify-between mb-2.5">
        <span
          className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-semibold"
          style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}40` }}
        >
          {prettyActivity(g.activityType)}
        </span>
        {g.status !== "open" && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
            <Lock className="h-3 w-3" /> {g.status}
          </span>
        )}
      </div>

      <h4 className="font-serif text-lg leading-snug mb-1.5" style={{ color: "#fff" }}>{g.name}</h4>
      {g.venueName && (
        <p className="text-xs mb-3 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          <MapPin className="h-3 w-3" /> {g.venueName}
        </p>
      )}

      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="flex items-center gap-2 text-xs" style={{ color: full ? "#fca5a5" : "rgba(255,255,255,0.75)" }}>
          <span className="inline-flex items-center gap-1" title="Men">👨 {g.menCount}</span>
          <span className="inline-flex items-center gap-1" title="Women">👩 {g.womenCount}</span>
          <span className="inline-flex items-center gap-1 ml-0.5" style={{ color: full ? "#fca5a5" : GOLD }} title="Total members">
            <Users className="h-3.5 w-3.5" /> {g.memberCount}/{g.maxMembers}
          </span>
        </span>
        {g.myMembershipStatus === "approved" ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(74,222,128,0.14)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>Joined</span>
        ) : g.myMembershipStatus === "requested" ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${GOLD}1a`, color: GOLD, border: `1px solid ${GOLD}40` }}>Pending</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium transition-transform group-hover:translate-x-0.5" style={{ color: accent }}>
            View <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </button>
  );
}
