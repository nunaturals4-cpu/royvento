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
import { useGetMe, useLogout, useGetSoloAccess } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { Search, Bell, Menu, X as XIcon, MapPin, ChevronDown, Globe, Palette, Check, Gift } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
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
  isRead: boolean;
  createdAt: string;
}

export function Navbar() {
  const { t, i18n } = useTranslation();
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]!;
  const { theme, setTheme } = useTheme();
  const currentTheme = THEMES.find((th) => th.id === theme) ?? THEMES[0]!;
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  // Solo Connect is gated to premium / verified-partner accounts. Only query
  // when logged in; the nav entry stays hidden for everyone else.
  const { data: soloAccess } = useGetSoloAccess({
    query: { enabled: !!me?.user, retry: false } as any,
  });
  const logout = useLogout();
  const [location, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();

  const { selectedCity, selectedLocality } = useSelectedCity();
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
    staleTime: 10 * 60 * 60 * 1000,
    refetchInterval: false,
  });

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
    mutationFn: async () => {
      const unread = notifs.filter((n) => !n.isRead);
      await Promise.all(unread.map((n) => apiPatch(`/api/notifications/${n.id}/read`, {})));
    },
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

  // Primary navigation (left of the second tier) — shared by the desktop bar and
  // the mobile drawer so the two never drift out of sync.
  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/tonight-plans", label: t("nav.tonight_plans", "Tonight Plans") },
    { href: "/pubs", label: t("nav.pubs") },
    { href: "/events", label: t("nav.events", "Events") },
    { href: "/games", label: t("nav.games", "Games & Sports") },
    { href: "/pub-offers", label: t("nav.pub_offers") },
    // Premium / verified-partner only — hidden entirely otherwise.
    ...(soloAccess?.eligible ? [{ href: "/solo-connect", label: t("nav.solo_connect", "Solo Connect") }] : []),
  ];
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
    { href: "/subscription", label: t("nav.premium", "Premium") },
    { href: "/contact", label: t("footer.contact", "Contact") },
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
              ? "bg-background/95 backdrop-blur-xl shadow-md shadow-black/30"
              : "bg-background"
          } border-b border-border/60`}
        >
          <div className="container mx-auto px-4 md:px-6 h-[68px] flex items-center gap-3 md:gap-5">
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
                              onClick={() => { if (!n.isRead) markReadMutation.mutate(n.id); }}
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

              {/* Hamburger — tablet/mobile only, far right (BookMyShow position). */}
              <Button
                variant="ghost"
                size="icon"
                className={`lg:hidden -mr-1.5 ${iconBtn}`}
                onClick={() => setMobileOpen((v) => !v)}
                aria-label={mobileOpen ? t("nav.close_menu", "Close menu") : t("nav.open_menu", "Open menu")}
              >
                {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* ───────────── TIER 2 — primary nav (left) · utility links (right) ───────────── */}
        <div
          className={`hidden lg:block border-b border-border/50 transition-all duration-300 ${
            scrolled ? "bg-background/90 backdrop-blur-xl" : "bg-card/40"
          }`}
        >
          <div className="container mx-auto px-4 md:px-6 h-11 flex items-center justify-between">
            <nav className="flex items-center gap-8 xl:gap-10 text-sm font-medium">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative py-1 transition-colors ${
                      active ? "text-primary font-semibold" : "text-foreground/80 hover:text-primary"
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span className="pointer-events-none absolute -bottom-[5px] left-0 right-0 h-0.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--theme-glow-rgb),0.7)]" />
                    )}
                  </Link>
                );
              })}
            </nav>

            <nav className="flex items-center gap-6 text-sm">
              {utilityItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-white hover:text-primary transition-colors"
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

              {/* Mobile primary nav links */}
              <nav className="flex flex-col">
                {navItems.map(({ href, label }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 py-3.5 text-base font-medium transition-colors border-b border-border/40 ${
                        active ? "text-primary" : "text-white hover:text-primary"
                      }`}
                    >
                      <span
                        className={`h-5 w-1 rounded-full transition-all ${active ? "bg-primary" : "bg-transparent"}`}
                        aria-hidden="true"
                      />
                      {label}
                    </Link>
                  );
                })}
                <Link
                  href="/blogs"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 py-3.5 text-base font-medium text-white hover:text-primary transition-colors border-b border-border/40"
                >
                  <span className="h-5 w-1 rounded-full bg-transparent" aria-hidden="true" />
                  {t("nav.blogs", "Blogs")}
                </Link>
                {user && (
                  <Link
                    href="/notifications"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between py-3.5 pl-4 text-base font-medium text-muted-foreground hover:text-foreground transition-colors border-b border-border/40"
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
