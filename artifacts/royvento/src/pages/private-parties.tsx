import { useState } from "react";
import { Link } from "wouter";
import { useGetMe, useGetSoloAccess, useListParties, type Party } from "@workspace/api-client-react";
import { useSelectedCity } from "@/components/LocationContext";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";
import { Spinner } from "@/components/ui/spinner";
import { CreatePartyModal } from "@/components/party/CreatePartyModal";
import { joinBadge } from "@/components/solo-connect/CreatePartyWizard";
import {
  PartyPopper,
  Plus,
  MapPin,
  Navigation,
  Search,
  Crown,
  LogIn,
  ArrowRight,
  Ticket,
  Sparkles,
  Lock,
} from "lucide-react";

// Solo Connect palette — gold premium accents + red call-to-action buttons.
const GOLD = "#d4af37";
const RED = "#b91c1c";

// House-party hero visual — local asset in public/images, served at /images/*.
// Drop the photo at artifacts/royvento/public/images/house-party-hero.jpg.
const HERO_IMAGE = "/images/house-party-hero.jpg";

// Where login should return the visitor once authenticated.
const LOGIN_NEXT = `/login?next=${encodeURIComponent("/private-parties")}`;

const norm = (s: string) => (s ?? "").trim().toLowerCase();

// Location scoping for the listing. A GPS-detected city is often a hyper-local
// name (e.g. "Bidhannagar") while a party is tagged with the curated city the
// host picked in the create wizard (e.g. "Kolkata"). An exact city match hid
// those parties from the very person who created them, so we match leniently:
//   • by city/locality — either string contains the other, OR
//   • by the detected state as a fallback (e.g. both "West Bengal").
// With no location signal at all, show everything.
function locationMatches(party: Party, city: string, locality: string, state: string): boolean {
  const pc = norm(party.city);
  const ps = norm(party.state);
  const c = norm(city);
  const l = norm(locality);
  const st = norm(state);
  if (!c && !l && !st) return true;
  const near = (a: string, b: string) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  if (near(pc, c) || near(pc, l)) return true;
  if (st && ps && ps === st) return true;
  return false;
}

export function PrivateParties() {
  const { data: me, isLoading: meLoading } = useGetMe({ query: { retry: false } as any });
  const loggedIn = !!me?.user;
  const role = me?.user?.role;
  const isPrivileged = role === "admin" || role === "vendor";

  // Hosting a party is a premium act (server enforces this via requireHost).
  const { data: access } = useGetSoloAccess({ query: { enabled: loggedIn, retry: false } as any });
  const canHost = loggedIn && (isPrivileged || !!access?.eligible);

  return (
    <>
      <SEO title="Create & Join Private Parties | Royvento" />
      <div className="relative min-h-[80vh] overflow-hidden bg-background">
        {/* Ambient warm glow field */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-20 h-[420px] w-[720px] rounded-full blur-[120px] opacity-45"
            style={{ background: `radial-gradient(ellipse at center, ${RED}40, transparent 70%)` }} />
          <div className="absolute top-20 right-0 h-72 w-72 rounded-full blur-[110px] opacity-25"
            style={{ background: `radial-gradient(circle, ${GOLD}33, transparent 70%)` }} />
        </div>

        <div className="relative container mx-auto px-4 md:px-6 pt-12 md:pt-14 pb-24">
          <CompactHeading />
          <HeroSection canHost={canHost} loggedIn={loggedIn} />

          <div className="mt-10">
            {meLoading ? (
              <div className="py-24 flex justify-center"><Spinner /></div>
            ) : (
              <BrowseParties canHost={canHost} loggedIn={loggedIn} />
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
          <PartyPopper className="h-3 w-3" /> Host · Join · Celebrate
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
          Create &amp; Join Private Parties
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {[
          { icon: Sparkles, label: "Host it your way" },
          { icon: Ticket, label: "Free RSVP or paid tickets" },
          { icon: MapPin, label: "Parties in your city" },
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

function HeroSection({ canHost, loggedIn }: { canHost: boolean; loggedIn: boolean }) {
  const { selectedCity } = useSelectedCity();
  const [showCreate, setShowCreate] = useState(false);

  // CTA destination depends on the visitor's state: guests log in, members
  // upgrade, eligible hosts open the wizard directly.
  const cta = !loggedIn
    ? { kind: "link" as const, href: LOGIN_NEXT, icon: LogIn, label: "Log in to host a party" }
    : !canHost
      ? { kind: "link" as const, href: "/subscription?plan=user_vip", icon: Crown, label: "Go Premium to host" }
      : { kind: "button" as const, icon: Plus, label: "Host your party" };

  const ctaStyle = { background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 30px ${RED}4d` };

  return (
    <>
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-9 min-h-[400px] md:min-h-[480px] flex flex-col justify-end mt-9"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* House-party background image */}
        <img
          src={HERO_IMAGE}
          alt="Friends celebrating at a house party"
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="lazy"
          draggable={false}
        />
        {/* Readability + brand-warmth overlays — kept light up top so the photo
            reads clearly, darkening only toward the bottom behind the text. */}
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.22)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 42%, rgba(0,0,0,0.68) 82%, rgba(0,0,0,0.92) 100%)" }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(115deg, ${RED}26, transparent 55%, ${GOLD}14)` }} />
        <div className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full blur-3xl opacity-40" style={{ background: `${GOLD}30` }} />

        <div className="relative max-w-2xl">
          <h2 className="font-serif text-2xl md:text-[2.1rem] leading-snug mb-2" style={{ color: "#fff" }}>
            Throw your own party — or join one tonight.
          </h2>
          <p className="text-sm md:text-base mb-6 max-w-xl" style={{ color: "rgba(255,255,255,0.78)" }}>
            House parties, rooftop nights, birthday bashes and more. Set it up in minutes with free RSVPs
            or paid tickets, and discover private parties happening near you.
          </p>

          {cta.kind === "button" ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
              style={ctaStyle}
            >
              <cta.icon className="h-4 w-4" /> {cta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : (
            <Link
              href={cta.href}
              className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
              style={ctaStyle}
            >
              <cta.icon className="h-4 w-4" /> {cta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>

      {showCreate && (
        <CreatePartyModal city={selectedCity || ""} onClose={() => setShowCreate(false)} />
      )}
    </>
  );
}

// Browse surface — needs a city to scope the listing, then renders only
// "Create Your Own Party" entities for that city.
function BrowseParties({ canHost, loggedIn }: { canHost: boolean; loggedIn: boolean }) {
  const { selectedCity, selectedLocality, selectedState, detectLocation, detecting, locationError } = useSelectedCity();

  if (!selectedCity) {
    return (
      <div
        className="relative max-w-md mx-auto rounded-3xl overflow-hidden p-8 text-center"
        style={{
          background: "linear-gradient(180deg, rgba(24,22,26,0.92), rgba(14,13,16,0.92))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: `0 30px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
      >
        <span className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-5"
          style={{ background: `linear-gradient(145deg, ${RED}26, ${GOLD}14)`, border: `1px solid ${RED}55`, boxShadow: `0 0 30px ${RED}26` }}>
          <Navigation className="h-7 w-7" style={{ color: GOLD }} />
        </span>
        <h3 className="font-serif text-2xl mb-2" style={{ color: "#fff" }}>Enable your location</h3>
        <p className="text-sm mb-7 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
          We only show private parties in your current city. Share your location to continue.
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
      </div>
    );
  }

  return (
    <PartyList
      city={selectedCity}
      locality={selectedLocality}
      state={selectedState}
      canHost={canHost}
      loggedIn={loggedIn}
    />
  );
}

// Discovery rail for standalone "Create Your Own Party" entities. Cards link to
// the party profile page. Only parties are shown here — nothing else.
function PartyList({ city, locality, state, canHost, loggedIn }: { city: string; locality: string; state: string; canHost: boolean; loggedIn: boolean }) {
  const { toast } = useToast();
  // Fetch every live party (the endpoint caps at 200) and scope to the viewer's
  // location on the client — this lets us match on city/locality/state together,
  // which the server's city-only query couldn't do.
  const { data: parties = [], isLoading } = useListParties(
    undefined,
    { query: { retry: false } as any },
  );
  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ] = useState("");
  const [tType, setTType] = useState<"all" | "free" | "paid">("all");
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");

  const allLive = (parties as Party[]).filter((p) => p.status !== "cancelled");
  // Surface every live party, but float the ones near the viewer to the top.
  // Strict city-only scoping was hiding freshly-created parties whose curated
  // city (e.g. "Kolkata") differs from the viewer's hyper-local detected area
  // (e.g. the "Bidhannagar" locality) — and on desktop there's no GPS/state
  // signal to bridge the two, so we rank by proximity instead of hard-filtering.
  const live = [...allLive].sort(
    (a, b) =>
      (locationMatches(a, city, locality, state) ? 0 : 1) -
      (locationMatches(b, city, locality, state) ? 0 : 1),
  );

  const filtered = live.filter((p) => {
    if (tType !== "all" && p.ticketType !== tType) return false;
    if (q.trim()) {
      const hay = `${p.name} ${p.venueName} ${p.city}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    if (p.ticketType === "paid") {
      const price = Number(p.ticketPrice);
      if (minP && price < Number(minP)) return false;
      if (maxP && price > Number(maxP)) return false;
    } else if (minP && Number(minP) > 0) {
      return false;
    }
    return true;
  });

  const seg = (v: "all" | "free" | "paid", label: string) => {
    const active = tType === v;
    return (
      <button key={v} type="button" onClick={() => setTType(v)}
        className="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-200"
        style={{
          background: active ? `${GOLD}26` : "transparent",
          border: `1px solid ${active ? GOLD : "transparent"}`,
          color: active ? "#fff" : "rgba(255,255,255,0.5)",
          boxShadow: active ? `0 0 14px ${GOLD}30` : "none",
        }}>
        {label}
      </button>
    );
  };

  const hostBtnStyle = { background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 8px 22px ${RED}40` };

  return (
    <section>
      {/* Premium header card */}
      <div
        className="relative mb-5 overflow-hidden rounded-2xl p-5 md:p-6"
        style={{
          background: `linear-gradient(135deg, rgba(8,6,0,0.99) 0%, rgba(26,20,3,0.97) 40%, rgba(18,13,1,0.98) 70%, rgba(8,6,0,0.99) 100%)`,
          border: `1px solid ${GOLD}28`,
          boxShadow: `0 0 80px ${GOLD}12, 0 20px 50px rgba(0,0,0,0.6), inset 0 1px 0 ${GOLD}18`,
        }}
      >
        <div className="pointer-events-none absolute -top-16 -right-16 h-52 w-52 rounded-full blur-3xl opacity-50" style={{ background: `${GOLD}1a` }} />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full blur-3xl opacity-35" style={{ background: `${RED}18` }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent 5%, ${GOLD}cc 40%, ${GOLD}cc 60%, transparent 95%)` }} />

        {/* Header row */}
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
          <span
            className="flex items-center justify-center h-[52px] w-[52px] rounded-2xl shrink-0"
            style={{
              background: `linear-gradient(145deg, ${GOLD}28, ${RED}1e)`,
              border: `1px solid ${GOLD}50`,
              boxShadow: `0 0 32px ${GOLD}30, inset 0 1px 0 rgba(255,255,255,0.07)`,
            }}
          >
            <PartyPopper className="h-6 w-6" style={{ color: GOLD }} />
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2.5 mb-1">
              <h3
                className="font-serif text-2xl md:text-[1.75rem] leading-none"
                style={{
                  background: `linear-gradient(135deg, #ffffff 0%, #e7d9b4 45%, ${GOLD} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Private parties near {city}
              </h3>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}50`, boxShadow: `0 0 12px ${GOLD}28` }}
              >
                {filtered.length} live
              </span>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.42)" }}>
              Host-run parties you can book — free RSVP or paid tickets
            </p>
          </div>

          {/* Host CTA lives in the header so it's always reachable */}
          {canHost ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all hover:brightness-110 shrink-0"
              style={hostBtnStyle}
            >
              <Plus className="h-4 w-4" /> Host a party
            </button>
          ) : (
            <Link
              href={loggedIn ? "/subscription?plan=user_vip" : LOGIN_NEXT}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all hover:brightness-110 shrink-0"
              style={hostBtnStyle}
            >
              {loggedIn ? <Crown className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {loggedIn ? "Go Premium to host" : "Log in to host"}
            </Link>
          )}
        </div>

        {/* Premium filter panel */}
        <div className="relative flex flex-wrap items-center gap-2 rounded-xl p-1.5" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.28)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search parties…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "#fff" }}
            />
          </div>

          <div className="flex items-center gap-0.5 rounded-lg p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {seg("all", "All")}{seg("free", "Free")}{seg("paid", "Paid")}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              value={minP}
              onChange={(e) => setMinP(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="₹ min"
              disabled={tType === "free"}
              className="w-20 px-2.5 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "#fff", opacity: tType === "free" ? 0.3 : 1, transition: "opacity 0.2s" }}
            />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>—</span>
            <input
              value={maxP}
              onChange={(e) => setMaxP(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="₹ max"
              disabled={tType === "free"}
              className="w-20 px-2.5 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "#fff", opacity: tType === "free" ? 0.3 : 1, transition: "opacity 0.2s" }}
            />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}30, transparent)` }} />
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : live.length === 0 ? (
        <EmptyParties city={city} canHost={canHost} onHost={() => setShowCreate(true)} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-8 rounded-2xl" style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}>No parties match your filters.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((p) => (
            <PartyCard
              key={p.id}
              p={p}
              onLocked={() =>
                toast({
                  title: "Private party — invite only",
                  description: "Ask the host for their invite link to open this party.",
                  variant: "destructive",
                })
              }
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePartyModal city={city} onClose={() => setShowCreate(false)} />
      )}
    </section>
  );
}

function EmptyParties({ city, canHost, onHost }: { city: string; canHost: boolean; onHost: () => void }) {
  return (
    <div
      className="relative max-w-md mx-auto rounded-3xl overflow-hidden py-14 px-8 text-center"
      style={{
        background: "linear-gradient(180deg, rgba(24,22,26,0.92), rgba(14,13,16,0.92))",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `0 30px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
        style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}33` }}>
        <PartyPopper className="h-6 w-6" style={{ color: GOLD }} />
      </span>
      <p className="font-serif text-xl mb-1" style={{ color: "#fff" }}>No parties yet in {city}</p>
      <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
        {canHost ? "Be the first to throw one — set up your party in minutes." : "Check back soon — new parties drop all the time."}
      </p>
      {canHost && (
        <button
          type="button"
          onClick={onHost}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 28px ${RED}4d` }}
        >
          <Plus className="h-4 w-4" /> Host your party
        </button>
      )}
    </div>
  );
}

// Mirrors the homepage EventCard visual language so listings read consistently.
function PartyCard({ p, onLocked }: { p: Party; onLocked: () => void }) {
  const isPaid = p.ticketType === "paid";
  const loc = [p.venueName, p.city].filter(Boolean).join(", ");
  const isPrivate = p.visibility === "private";
  // Private parties stay VISIBLE in the city list for discovery, but are shown
  // locked to everyone except the host — opening/booking is gated behind the
  // host's invite link (enforced server-side). The host sees theirs unlocked.
  const locked = isPrivate && !p.isOrganizer;

  const card = (
      <article className="group cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111111] transition-all duration-300 hover:border-[#d4af37]/40 hover:shadow-[0_0_0_1px_rgba(212,175,55,0.18),0_8px_32px_rgba(0,0,0,0.6)]">
        <div className="relative aspect-video overflow-hidden bg-black/40">
          {p.coverImageUrl
            ? <img src={p.coverImageUrl} alt={p.name} loading="lazy" className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05] ${locked ? "blur-[2px] scale-[1.03]" : ""}`} />
            : <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${GOLD}33, ${RED}22)` }} />}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
          {/* Always-on lock sign for private parties (host included). */}
          {isPrivate && (
            <span className="absolute top-2 right-2 z-20 flex items-center justify-center h-7 w-7 rounded-full"
              style={{ background: "rgba(0,0,0,0.62)", border: `1px solid ${GOLD}66`, boxShadow: `0 0 14px ${GOLD}33` }}>
              <Lock className="h-3.5 w-3.5" style={{ color: GOLD }} />
            </span>
          )}
          {/* Locked overlay — "you can see it, but it's invite-only". */}
          {locked && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-center px-3"
              style={{ background: "rgba(8,6,10,0.5)", backdropFilter: "blur(1px)" }}>
              <span className="flex items-center justify-center h-11 w-11 rounded-full"
                style={{ background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, boxShadow: `0 0 22px ${GOLD}30` }}>
                <Lock className="h-5 w-5" style={{ color: GOLD }} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>Invite only</span>
              <span className="text-[10px] leading-tight" style={{ color: "rgba(255,255,255,0.6)" }}>Open the host's link to unlock</span>
            </div>
          )}
        </div>
        <div className="p-3.5">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: GOLD, color: "#1a1205" }}>Party</span>
            {!isPaid && <span className="inline-flex items-center rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Free Entry</span>}
            {isPrivate && (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: `${GOLD}55`, background: `${GOLD}1f`, color: GOLD }}>
                <Lock className="h-2.5 w-2.5" /> Invite only
              </span>
            )}
            <span className="inline-flex items-center rounded-md border border-white/20 bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/85">{joinBadge(p.joinType)}</span>
          </div>
          <h3 className="text-[15px] font-bold leading-tight text-white line-clamp-1 transition-colors duration-200 group-hover:text-[#d4af37]">{p.name}</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">
            {[loc, p.partyDate].filter(Boolean).join(" · ") || "Party"}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
            <span className="text-[11px] text-muted-foreground/70">Entry</span>
            <span className="text-sm font-bold text-white">{isPaid ? `₹${Number(p.ticketPrice).toLocaleString("en-IN")}` : "Free"}</span>
          </div>
        </div>
      </article>
  );

  // Locked private party → don't navigate; surface a validation message instead.
  // Invited guests reach it via the host's share link (which carries the token),
  // not through this public list.
  if (locked) {
    return (
      <button type="button" onClick={onLocked} className="block w-full text-left" aria-label={`${p.name} — private, invite only`}>
        {card}
      </button>
    );
  }
  return <Link href={`/party/${p.id}`}>{card}</Link>;
}
