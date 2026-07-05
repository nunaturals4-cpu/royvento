import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import {
  Search, Bell, Menu, X as XIcon, MapPin, ChevronDown, Globe, Palette, Check, Gift, Receipt,
  Moon, CalendarDays, Wine, Gamepad2, UserPlus, PartyPopper, Info, Newspaper, Mail,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { useSelectedCity } from "@/components/LocationContext";
import { CityPickerModal } from "@/components/CityPickerModal";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n/index";
import { LANGUAGES } from "@/components/ui/LanguageSwitcher";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/ThemeProvider";
import { THEMES } from "@/components/ui/ThemeSwitcher";

interface Notification {
  id: number;
  title: string;
  message: string;
  /** Deep-link target opened when the notification is tapped. */
  url?: string;
  type?: string;
  isRead: boolean;
  createdAt: string;
}

// ── Premium navigation model ──────────────────────────────────────────────
// Each leaf carries a line icon + a short subtitle so the mega-dropdown reads
// like a product menu (Airbnb/Notion) rather than a plain list. `navKey` maps to
// the admin per-item hide settings (site_settings.hidden_nav_links); leaves with
// no key are always shown (e.g. About / Blog / Contact).
interface NavLeaf {
  href: string;
  label: string;
  sub: string;
  Icon: LucideIcon;
  navKey?: string;
}
type NavGroup =
  | { kind: "link"; label: string; href: string; navKey?: string }
  | { kind: "menu"; label: string; items: NavLeaf[] };

// Shared pill styling for a top-level nav entry (trigger or plain link), so the
// bar reads as one refined segmented control. Active = understated frosted-glass
// pill (luxury, not nightlife); idle = ghost that warms subtly on hover. The
// brand accent is expressed only as a small dot (see ActiveDot), never a glow.
function navPillClass(active: boolean): string {
  return [
    "relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium tracking-[0.015em] transition-all duration-300 ease-out outline-none",
    active
      ? "text-white bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.35)]"
      : "text-white/85 hover:text-white hover:bg-white/[0.045]",
  ].join(" ");
}

// Understated luxury accent — a single soft dot instead of a bright red glow.
function ActiveDot() {
  return (
    <span
      className="h-[5px] w-[5px] shrink-0 rounded-full bg-primary/90"
      style={{ boxShadow: "0 0 6px rgba(var(--theme-glow-rgb),0.55)" }}
      aria-hidden="true"
    />
  );
}

// A single floating mega-dropdown. Opens on hover (with a hover-bridge so the
// pointer can travel from trigger to panel) and on keyboard focus. The panel is
// a dark-charcoal glass card that fades + slides in.
function NavMenu({ label, active, children }: { label: string; active: boolean; children: React.ReactNode }) {
  return (
    <div className="relative group flex h-full items-center">
      <button type="button" aria-haspopup="true" className={navPillClass(active)}>
        {active && <ActiveDot />}
        {label}
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-300 ease-out group-hover:rotate-180"
          strokeWidth={2.5}
          style={{ color: "#E8C15A" }}
        />
      </button>

      {/* Hover bridge (pt-3) keeps hover alive across the gap to the panel. */}
      <div className="invisible absolute left-0 top-full z-50 translate-y-1.5 pt-3.5 opacity-0 transition-all duration-200 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div
          className="relative min-w-[308px] overflow-hidden rounded-[20px] p-2.5"
          style={{
            background: "linear-gradient(180deg, #161616 0%, #111111 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* Soft accent glow bloom in the corner for depth. */}
          <div
            className="pointer-events-none absolute -top-6 right-6 h-24 w-24 rounded-full blur-2xl"
            style={{ background: "rgba(var(--theme-glow-rgb),0.10)" }}
          />
          <div className="relative">{children}</div>
        </div>
      </div>
    </div>
  );
}

// One row inside a mega-dropdown: iconed, titled, with a descriptive subtitle.
function NavMenuItem({ leaf, active, onNavigate }: { leaf: NavLeaf; active: boolean; onNavigate?: () => void }) {
  const { Icon } = leaf;
  return (
    <Link
      href={leaf.href}
      onClick={onNavigate}
      className={`group/item flex items-center gap-3.5 rounded-2xl px-3 py-3 transition-all duration-200 focus:outline-none ${
        active ? "bg-white/[0.05]" : "hover:bg-white/[0.045] focus:bg-white/[0.055]"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-all duration-300 ease-out ${
          active
            ? "border-white/[0.1] bg-gradient-to-br from-white/[0.09] to-white/[0.02]"
            : "border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-transparent group-hover/item:border-white/[0.12] group-hover/item:from-white/[0.08]"
        }`}
      >
        <Icon
          className="h-[18px] w-[18px] transition-all duration-300 ease-out group-hover/item:scale-110"
          style={{ color: "#E8C15A" }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`block text-[13.5px] font-medium leading-tight tracking-[0.01em] ${active ? "text-white" : "text-white/90"}`}>
            {leaf.label}
          </span>
          {active && <span className="h-1 w-1 rounded-full bg-primary/90" style={{ boxShadow: "0 0 6px rgba(var(--theme-glow-rgb),0.6)" }} />}
        </span>
        <span className="mt-1 block text-[11.5px] leading-snug text-white/40">{leaf.sub}</span>
      </span>
      {/* Subtle chevron affordance that slides in on hover. */}
      <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-white/0 transition-all duration-200 group-hover/item:translate-x-0.5 group-hover/item:text-white/30" aria-hidden="true" />
    </Link>
  );
}

export function Navbar() {
  const { t, i18n } = useTranslation();
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]!;
  const { theme, setTheme } = useTheme();
  const currentTheme = THEMES.find((th) => th.id === theme) ?? THEMES[0]!;
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const logout = useLogout();
  const [location, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();

  const { selectedCity, selectedLocality, coords } = useSelectedCity();
  // Show the precise locality (e.g. "Tarulia") when we have it, falling back to
  // the city (e.g. "Bidhannagar"). Matches Zomato/Swiggy's "area-first" label.
  const locationLabel = selectedLocality || selectedCity;

  const user = me?.user as any;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const { data: notifs = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => apiGet<Notification[]>("/api/notifications"),
    enabled: !!user,
    // Poll in the background so the bell reflects new follow notifications
    // within ~1 min even when web push isn't configured/granted (mirrors the
    // mobile app). Push, when available, still updates it instantly via the
    // service-worker message listener below.
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // Global, admin-controlled visibility: which primary-nav items are hidden.
  const { data: siteSettings } = useQuery<{ hiddenNavLinks: string[] }>({
    queryKey: ["site-settings"],
    queryFn: () => apiGet<{ hiddenNavLinks: string[] }>("/api/site-settings"),
    staleTime: 5 * 60 * 1000,
  });
  const hiddenNavLinks = siteSettings?.hiddenNavLinks ?? [];

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiPatch(`/api/notifications/${id}/read`, {}),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      qc.setQueryData<Notification[]>(["notifications"], (prev) =>
        (prev ?? []).map((n) => n.id === id ? { ...n, isRead: true } : n),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiPatch("/api/notifications/read-all", {}),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      qc.setQueryData<Notification[]>(["notifications"], (prev) =>
        (prev ?? []).map((n) => ({ ...n, isRead: true })),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  // Refresh the notifications cache instantly when the service worker
  // receives a web-push for this user, so the badge updates without polling.
  useEffect(() => {
    if (!user) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "royvento-notification") {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [user, qc]);

  // Note: we deliberately do NOT refetch notifications on visibilitychange /
  // window focus. That implicit refetch caused a "page is silently
  // refreshing" feeling whenever the user came back to the tab. Real-time
  // updates still arrive via the service-worker push-message listener above,
  // and the badge updates whenever the user navigates or marks a notification
  // read. If a stale badge is ever an issue, the user can refresh manually.

  // Persist the logged-in user's latest location for nearby-offer alerts. Fires
  // when they log in (user + coords both present) and whenever the detected
  // position changes; the server ignores sub-~50 m jitter. Requirement (1):
  // "save the user's current location on login; update it if it changes."
  const lastPostedLoc = useRef<string>("");
  useEffect(() => {
    if (!user || !coords) return;
    const key = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
    if (lastPostedLoc.current === key) return;
    lastPostedLoc.current = key;
    apiPost("/api/users/me/location", { lat: coords.lat, lng: coords.lng }).catch(() => {});
  }, [user, coords]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        refetch();
        setLocation("/");
      },
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    setLocation(term ? `/pubs?search=${encodeURIComponent(term)}` : "/pubs");
  };

  const unreadCount = notifs.filter((n) => !n.isRead).length;

  // Tapping a notification marks it read and, if it carries a deep link, opens
  // the exact event/offer/venue page so the user can book or claim right away.
  const openNotification = (n: Notification) => {
    if (!n.isRead) markReadMutation.mutate(n.id);
    setNotifOpen(false);
    if (n.url && n.url !== "/") setLocation(n.url);
  };

  // Primary navigation (left of the second tier) — shared by the desktop bar and
  // the mobile drawer so the two never drift out of sync. Built from the shared
  // NAV_ITEMS list and filtered by the admin-controlled per-item hide settings.
  // (Solo Connect stays visible to everyone — the premium gate is enforced on
  // the page, not by hiding the nav entry — unless an admin hides it here.)
  // Grouped, premium mega-navigation. Leaves keep their `navKey` so the existing
  // admin per-item hide settings still apply; a group whose leaves are all hidden
  // collapses away. `NAV_ITEMS` remains the source of truth for which keys exist.
  const navGroups: NavGroup[] = [
    { kind: "link", label: t("nav.home", "Home"), href: "/", navKey: "home" },
    {
      kind: "menu",
      label: t("nav.discover", "Discover"),
      items: [
        { href: "/tonight-plans", label: t("nav.tonight", "Tonight"), sub: t("nav.tonight_sub", "What's on right now"), Icon: Moon, navKey: "tonight-plans" },
        { href: "/events", label: t("nav.events", "Events"), sub: t("nav.events_sub", "Live shows & gigs"), Icon: CalendarDays, navKey: "events" },
        { href: "/pub-offers", label: t("nav.happy_hour", "Happy Hour"), sub: t("nav.happy_hour_sub", "Drink deals & offers"), Icon: Wine, navKey: "pub-offers" },
      ],
    },
    // Direct link (no dropdown) — a single destination doesn't warrant a menu.
    { kind: "link", label: t("nav.pub_club", "Pub & Club"), href: "/pubs", navKey: "pubs" },
    {
      kind: "menu",
      label: t("nav.experiences", "Experiences"),
      items: [
        { href: "/games", label: t("nav.games", "Games & Sports"), sub: t("nav.games_sub", "Play, watch & compete"), Icon: Gamepad2, navKey: "games" },
        { href: "/solo-connect", label: t("nav.solo_connect", "Solo Connect"), sub: t("nav.solo_connect_sub", "Meet like-minded people"), Icon: UserPlus, navKey: "solo-connect" },
        { href: "/private-parties", label: t("nav.private_parties_short", "Private Parties"), sub: t("nav.private_parties_sub", "Host or join a party"), Icon: PartyPopper, navKey: "private-parties" },
      ],
    },
    {
      kind: "menu",
      label: t("nav.more", "More"),
      items: [
        { href: "/about", label: t("nav.about", "About Us"), sub: t("nav.about_sub", "Our story & mission"), Icon: Info },
        { href: "/blogs", label: t("nav.blog", "Blog"), sub: t("nav.blog_sub", "Guides & stories"), Icon: Newspaper },
        { href: "/contact", label: t("nav.contact", "Contact"), sub: t("nav.contact_sub", "We're here to help"), Icon: Mail },
      ],
    },
  ];

  // Apply admin hide settings, then drop any menu left with no visible leaves.
  const visibleGroups: NavGroup[] = navGroups
    .map((g) =>
      g.kind === "menu" ? { ...g, items: g.items.filter((it) => !it.navKey || !hiddenNavLinks.includes(it.navKey)) } : g,
    )
    .filter((g) => (g.kind === "menu" ? g.items.length > 0 : !g.navKey || !hiddenNavLinks.includes(g.navKey)));
  // "List Your Venue" must land partners on the Become-a-Partner form without a
  // double click: logged-in users go straight there; logged-out users are routed
  // through login with a `next` param so they bounce back automatically after
  // signing in (RequireAuth on the route also enforces this server-of-truth).
  const becomeVendorHref = user
    ? "/dashboard/become-vendor"
    : `/login?next=${encodeURIComponent("/dashboard/become-vendor")}`;
  // Existing partners (vendors / event & game organizers) already have a venue
  // listed, so hide the "List Your Venue" CTA for them.
  const isPartner = !!user && ["vendor", "organizer", "game_organizer"].includes(user.role);
  // Utility links (right of the second tier) — surface existing destinations,
  // mirroring BookMyShow's "ListYourShow · Corporates · Offers · Gift Cards" rail.
  const utilityItems = [
    ...(isPartner ? [] : [{ href: becomeVendorHref, label: t("home.list_your_venue", "List Your Venue") }]),
  ];
  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  // Shared styling for the circular icon controls (notifications / hamburger).
  const iconBtn =
    "h-9 w-9 rounded-full text-foreground/70 hover:text-foreground bg-transparent hover:bg-foreground/[0.06] border border-transparent hover:border-border/70 transition-all duration-200";

  return (
    <>
      <header className="sticky top-0 z-50 w-full">
        {/* ───────────── TIER 1 — logo · search · city · account ───────────── */}
        <div
          className={`relative transition-all duration-300 ${
            scrolled
              ? "border-white/[0.07] bg-[#0d0d0f]/80 shadow-[0_10px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
              : "border-border/50 bg-background/70 backdrop-blur-md"
          } border-b`}
        >
          <div className="container mx-auto px-4 md:px-8 h-[70px] flex items-center gap-3 md:gap-6">
            {/* Hamburger — mobile/tablet only, far LEFT */}
            <Button
              variant="ghost"
              size="icon"
              className={`lg:hidden -ml-1.5 shrink-0 ${iconBtn}`}
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? t("nav.close_menu", "Close menu") : t("nav.open_menu", "Open menu")}
            >
              {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group shrink-0" aria-label="Royvento home">
              <Logo size={44} className="transition-transform duration-300 group-hover:scale-[1.05] drop-shadow-[0_2px_10px_rgba(var(--theme-glow-rgb),0.25)]" />
            </Link>

            {/* Search — prominent and always visible, BookMyShow-style. */}
            <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-2xl relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("nav.search_placeholder")}
                aria-label={t("nav.search_placeholder")}
                className="h-11 w-full pl-11 pr-4 bg-card border-border/70 rounded-xl text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
              />
            </form>

            {/* Right cluster — city · notifications · account */}
            <div className="flex items-center gap-2 md:gap-4 ml-auto shrink-0">
              {/* City selector */}
              <button
                onClick={() => setCityModalOpen(true)}
                className="hidden sm:flex items-center gap-1 text-sm font-medium text-foreground/90 hover:text-primary transition-colors max-w-[150px] group"
                aria-label="Select city"
              >
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{locationLabel || t("nav.select_city")}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-y-0.5" />
              </button>

              {user && (
                <div className="relative" ref={notifRef}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`relative ${iconBtn}`}
                    onClick={() => setNotifOpen((v) => !v)}
                    aria-label="Notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background shadow-[0_0_8px_rgba(var(--theme-glow-rgb),0.6)]">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>

                  {notifOpen && (
                    <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <p className="font-semibold text-sm">{t("nav.notifications")}</p>
                        {unreadCount > 0 && (
                          <button
                            onClick={() => markAllReadMutation.mutate()}
                            className="text-xs text-primary hover:underline"
                          >
                            {t("nav.mark_all_read")}
                          </button>
                        )}
                      </div>
                      {notifs.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                          <p className="text-sm text-muted-foreground">{t("nav.no_notifications")}</p>
                        </div>
                      ) : (
                        <div className="max-h-80 overflow-y-auto divide-y divide-border">
                          {notifs.map((n) => (
                            <div
                              key={n.id}
                              className={`px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors ${!n.isRead ? "bg-primary/5" : ""}`}
                              onClick={() => openNotification(n)}
                            >
                              <div className="flex items-start gap-2">
                                {!n.isRead && (
                                  <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                                )}
                                <div className={!n.isRead ? "" : "ml-4"}>
                                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                                    {new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="border-t border-border">
                        <Link
                          href="/notifications"
                          onClick={() => setNotifOpen(false)}
                          className="flex items-center justify-center px-4 py-3 text-xs font-medium text-primary hover:bg-accent/20 transition-colors"
                        >
                          {t("nav.view_all_notifications")}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 hover:bg-transparent group">
                      <span className="absolute inset-0 rounded-full ring-1 ring-primary/40 group-hover:ring-2 group-hover:ring-primary/60 transition-all duration-200 group-hover:shadow-[0_0_14px_rgba(var(--theme-glow-rgb),0.45)]" />
                      <Avatar className="h-9 w-9">
                        {user.profileImage ? <AvatarImage src={user.profileImage} /> : null}
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-semibold text-sm">
                          {user.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-60 bg-card border border-border shadow-xl" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                        <p className="text-[10px] uppercase tracking-wider text-primary mt-1">{user.role} · {user.points ?? 0} PTS</p>
                      </div>
                    </DropdownMenuLabel>
                    {/* Rewards: surface the ₹ value of the user's points + a redeem CTA so
                        they instantly see how much discount they can claim. ₹ value uses the
                        real checkout rate (POINTS_RUPEE_RATE = 0.05 → 100 pts = ₹5). */}
                    {(() => {
                      const pts = user.points ?? 0;
                      const rupee = Math.floor(pts * 0.05);
                      return (
                        <div className="mx-1 my-1.5 rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Reward Points</span>
                            <span className="text-sm font-bold text-foreground tabular-nums">{pts} PTS</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <Gift className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs font-semibold text-primary">
                              {rupee > 0 ? `₹${rupee} discount available` : "Earn points to unlock discounts"}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/profile" className="cursor-pointer w-full">{t("nav.my_profile")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/blogs" className="cursor-pointer w-full">{t("nav.blogs", "Blogs")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/split-expense" className="cursor-pointer w-full flex items-center gap-2">
                        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("nav.split_expense", "Split Expense")}
                      </Link>
                    </DropdownMenuItem>
                    {user.role === "user" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/bookings" className="cursor-pointer w-full">{t("nav.my_bookings")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/subscription" className="cursor-pointer w-full">{t("nav.subscription")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/wishlist" className="cursor-pointer w-full">{t("nav.wishlist")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/become-vendor" className="cursor-pointer w-full">{t("nav.become_partner")}</Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    {user.role === "organizer" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/bookings" className="cursor-pointer w-full">{t("nav.my_bookings")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/organizer" className="cursor-pointer w-full">{t("nav.event_management")}</Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    {user.role === "game_organizer" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/bookings" className="cursor-pointer w-full">{t("nav.my_bookings")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/game-organizer" className="cursor-pointer w-full">{t("nav.game_management", "Game Management")}</Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    {user.role === "vendor" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/bookings" className="cursor-pointer w-full">{t("nav.my_bookings")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/subscription" className="cursor-pointer w-full">{t("nav.subscription")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/partner" className="cursor-pointer w-full">{t("nav.partner_dashboard")}</Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    {user.role === "admin" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/dashboard/bookings" className="cursor-pointer w-full">{t("nav.my_bookings")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/subscription" className="cursor-pointer w-full">{t("nav.subscription")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/admin" className="cursor-pointer w-full">{t("nav.admin_panel")}</Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                      {t("nav.log_out")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <span className="h-3.5 w-3.5 rounded-full shrink-0 mr-1" style={{ background: currentTheme.color }} />
                        <Palette className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <span>Theme</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent alignOffset={-4} collisionPadding={8} className="bg-card border border-border shadow-xl w-44 max-w-[calc(100vw-1rem)]">
                        {THEMES.map((th) => (
                          <DropdownMenuItem
                            key={th.id}
                            onClick={() => setTheme(th.id)}
                            className="flex items-center gap-2.5 cursor-pointer"
                          >
                            <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ background: th.color }} />
                            <span className="flex-1">{th.label}</span>
                            {theme === th.id && <Check className="h-3.5 w-3.5 text-primary" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <Globe className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <span className="flex-1">{currentLang.native}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent alignOffset={-4} collisionPadding={8} className="bg-card border border-border shadow-xl w-44 max-w-[calc(100vw-1rem)]">
                        {LANGUAGES.map((lang) => (
                          <DropdownMenuItem
                            key={lang.code}
                            onClick={() => setLanguage(lang.code)}
                            className="flex items-center justify-between cursor-pointer"
                          >
                            <span className={lang.code === i18n.language ? "text-primary font-semibold" : ""}>{lang.native}</span>
                            <span className="text-xs text-muted-foreground">{lang.label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href="/login" className="hidden lg:block">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground red-glow border-0 rounded-md px-6 h-9 font-semibold">
                    {t("auth.sign_in", "Sign in")}
                  </Button>
                </Link>
              )}

            </div>
          </div>
        </div>

        {/* ───────────── TIER 2 — premium mega-nav (left) · utility links (right) ───────────── */}
        {/* Individual items here can be hidden site-wide from Admin → Site Settings. */}
        <div
          className={`hidden lg:block border-b transition-all duration-300 ${
            scrolled ? "border-white/[0.06] bg-[#0d0d0f]/70 backdrop-blur-2xl" : "border-border/40 bg-transparent"
          }`}
        >
          <div className="container mx-auto flex h-[56px] items-center justify-between px-4 md:px-8">
            {/* Segmented capsule — groups the primary nav into one refined control. */}
            <nav className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.012] p-1 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_12px_rgba(0,0,0,0.25)]">
              {visibleGroups.map((g) => {
                if (g.kind === "link") {
                  const active = isActive(g.href);
                  return (
                    <Link
                      key={g.label}
                      href={g.href}
                      aria-current={active ? "page" : undefined}
                      className={navPillClass(active)}
                    >
                      {active && <ActiveDot />}
                      {g.label}
                    </Link>
                  );
                }
                const groupActive = g.items.some((it) => isActive(it.href));
                return (
                  <NavMenu key={g.label} label={g.label} active={groupActive}>
                    {g.items.map((it) => (
                      <NavMenuItem key={it.href} leaf={it} active={isActive(it.href)} />
                    ))}
                  </NavMenu>
                );
              })}
            </nav>

            <nav className="flex items-center gap-2 text-[13px]">
              {utilityItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex items-center rounded-full border border-white/[0.14] bg-white/[0.05] px-4 py-[7px] font-medium text-white transition-all duration-200 hover:border-white/25 hover:bg-white/[0.1]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {/* ───────────── Mobile drawer ───────────── */}
        {mobileOpen && (
          <div className="lg:hidden relative bg-background/98 backdrop-blur-2xl border-b border-border shadow-xl shadow-black/40">
            <div className="container mx-auto px-4 py-4 space-y-4">
              {/* Mobile search */}
              <form onSubmit={(e) => { handleSearch(e); setMobileOpen(false); }} className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("nav.search_placeholder")}
                  className="h-11 w-full pl-10 bg-card border-border/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 rounded-xl"
                />
              </form>

              {/* Mobile city selector */}
              <button
                onClick={() => { setCityModalOpen(true); setMobileOpen(false); }}
                className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border border-border/70 bg-card/40 hover:border-primary/40 hover:bg-card/70 transition-colors text-sm"
              >
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground/85 font-medium truncate">
                  {locationLabel ? locationLabel : t("nav.select_city")}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
              </button>

              {/* Mobile grouped nav — mirrors the desktop mega-menu with iconed,
                  subtitled rows. Already filtered by the admin hide settings. */}
              <nav className="flex flex-col gap-4">
                {visibleGroups.map((g) => {
                  if (g.kind === "link") {
                    const active = isActive(g.href);
                    return (
                      <Link
                        key={g.label}
                        href={g.href}
                        onClick={() => setMobileOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold transition-colors ${
                          active ? "bg-primary/10 text-primary" : "text-white hover:bg-white/[0.04] hover:text-primary"
                        }`}
                      >
                        {g.label}
                      </Link>
                    );
                  }
                  return (
                    <div key={g.label}>
                      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                        {g.label}
                      </p>
                      <div className="flex flex-col">
                        {g.items.map((it) => {
                          const active = isActive(it.href);
                          const { Icon } = it;
                          return (
                            <Link
                              key={it.href}
                              href={it.href}
                              onClick={() => setMobileOpen(false)}
                              aria-current={active ? "page" : undefined}
                              className="group/m flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
                            >
                              <span
                                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                                  active
                                    ? "border-primary/40 bg-primary/10"
                                    : "border-white/[0.07] bg-white/[0.03] group-hover/m:border-primary/30"
                                }`}
                              >
                                <Icon className="h-[17px] w-[17px]" style={{ color: "#E8C15A" }} />
                              </span>
                              <span className="min-w-0 pt-0.5">
                                <span className={`block text-[14px] font-medium leading-tight ${active ? "text-primary" : "text-white/90"}`}>
                                  {it.label}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] leading-snug text-white/45">{it.sub}</span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {user && (
                  <Link
                    href="/notifications"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-2xl px-3 py-3 text-[15px] font-medium text-white/80 transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    <span>{t("nav.notifications")}</span>
                    {unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                )}
              </nav>

              {/* Mobile utility links */}
              <nav className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                {utilityItems.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </nav>

              {/* Mobile auth — logged-out only */}
              {!user && (
                <div className="flex gap-3 pt-1">
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="flex-1">
                    <Button variant="outline" className="w-full rounded-md h-11">{t("auth.sign_in", "Sign in")}</Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)} className="flex-1">
                    <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground red-glow border-0 rounded-md h-11 font-semibold">{t("nav.register")}</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <CityPickerModal open={cityModalOpen} onOpenChange={setCityModalOpen} />
    </>
  );
}
