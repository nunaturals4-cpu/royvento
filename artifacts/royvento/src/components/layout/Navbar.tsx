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
import { Search, Bell, Menu, X as XIcon, MapPin, ChevronDown, Palette, Globe, Check } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { useSelectedCity } from "@/components/LocationContext";
import { CityPickerModal } from "@/components/CityPickerModal";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/ThemeProvider";
import { THEMES } from "@/components/ui/ThemeSwitcher";
import { LANGUAGES } from "@/components/ui/LanguageSwitcher";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Notification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function Navbar() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]!;
  const currentTheme = THEMES.find((th) => th.id === theme) ?? THEMES[0]!;
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();

  const { selectedCity } = useSelectedCity();

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    if (searchOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

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

  return (
    <>
      <header className="sticky top-0 z-50 w-full">
        {/* Background — transparent at top, frosted glass when scrolled */}
        <div
          className={`absolute inset-0 transition-all duration-300 ${
            scrolled
              ? "bg-background/85 backdrop-blur-2xl border-b border-border/60 shadow-md shadow-black/20"
              : "bg-transparent"
          }`}
        />
        <div className="container mx-auto px-4 md:px-6 h-[68px] flex items-center justify-between relative gap-3">
          <div className="flex items-center gap-7 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-primary to-primary/70 flex items-center justify-center red-glow">
                  <span className="text-primary-foreground font-bold font-serif text-lg">R</span>
                </div>
              </div>
              <span className="font-serif font-bold text-xl tracking-tight">Royvento</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-7 text-sm font-medium">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">{t("nav.home")}</Link>
              <Link href="/pubs" className="text-muted-foreground hover:text-foreground transition-colors">{t("nav.pubs")}</Link>
              <Link href="/pub-offers" className="text-muted-foreground hover:text-foreground transition-colors">{t("nav.pub_offers")}</Link>
              <Link href="/blogs" className="text-muted-foreground hover:text-foreground transition-colors">{t("nav.blog")}</Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 md:gap-2.5">
            {/* Desktop search — collapsed to icon by default */}
            <div ref={searchRef} className="hidden lg:block">
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{ width: searchOpen ? "240px" : "36px" }}
              >
                {searchOpen ? (
                  <form
                    onSubmit={(e) => { handleSearch(e); setSearchOpen(false); }}
                    className="relative"
                  >
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      autoFocus
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setQ(""); } }}
                      placeholder={t("nav.search_placeholder")}
                      className="h-9 w-60 pl-8 bg-card/60 border-border focus:border-primary/40 rounded-full"
                    />
                  </form>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full hover:bg-foreground/8"
                    onClick={() => setSearchOpen(true)}
                    aria-label="Search"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* City selector — desktop pill chip */}
            <button
              onClick={() => setCityModalOpen(true)}
              className="hidden lg:flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/70 bg-card/50 hover:border-primary/50 hover:bg-card/80 transition-all text-sm min-w-0 max-w-[140px]"
              aria-label="Select city"
            >
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate text-xs font-medium text-foreground/80">
                {selectedCity || t("nav.select_city")}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>

            {user && (
              <div className="relative" ref={notifRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full hover:bg-foreground/8 relative"
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
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

            {/* Hamburger — mobile/tablet only */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9 rounded-full hover:bg-foreground/8"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:bg-foreground/8 p-0">
                    <Avatar className="h-9 w-9 border border-primary/40 ring-2 ring-primary/10">
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
                      <p className="text-[10px] uppercase tracking-wider text-primary mt-1">{user.role} · {user.points ?? 0} pts</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/profile" className="cursor-pointer w-full">{t("nav.my_profile")}</Link>
                  </DropdownMenuItem>
                  {user.role === "user" && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/bookings" className="cursor-pointer w-full">{t("nav.my_bookings")}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/wishlist" className="cursor-pointer w-full">{t("nav.wishlist")}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/subscription" className="cursor-pointer w-full">{t("nav.subscription")}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/become-vendor" className="cursor-pointer w-full">{t("nav.become_partner")}</Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {user.role === "vendor" && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/bookings" className="cursor-pointer w-full">{t("nav.my_bookings")}</Link>
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
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0 mr-1"
                        style={{ background: currentTheme.color }}
                      />
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
                          <span
                            className="h-3.5 w-3.5 rounded-full shrink-0"
                            style={{ background: th.color }}
                          />
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
                          onClick={() => i18n.changeLanguage(lang.code)}
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
              <>
                <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden lg:block">
                  {t("nav.login")}
                </Link>
                <Link href="/register" className="hidden lg:block">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground red-glow border-0 rounded-full px-5 h-9">
                    {t("nav.register")}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden relative border-t border-border bg-background/95 backdrop-blur-2xl">
            <div className="container mx-auto px-4 py-4 space-y-4">
              {/* Mobile search */}
              <form onSubmit={(e) => { handleSearch(e); setMobileOpen(false); }} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("nav.search_placeholder")}
                  className="h-10 w-full pl-9 bg-card/60 border-border focus:border-primary/40 rounded-full"
                />
              </form>

              {/* Mobile city selector */}
              <button
                onClick={() => { setCityModalOpen(true); setMobileOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-full border border-border bg-card/40 hover:border-primary/40 transition-colors text-sm"
              >
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground/80 font-medium">
                  {selectedCity ? selectedCity : t("nav.select_city")}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
              </button>

              {/* Mobile nav links */}
              <nav className="flex flex-col">
                {[
                  { href: "/", label: t("nav.home") },
                  { href: "/pubs", label: t("nav.pubs") },
                  { href: "/pub-offers", label: t("nav.pub_offers") },
                  { href: "/blogs", label: t("nav.blog") },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center py-3 text-base font-medium text-muted-foreground hover:text-foreground transition-colors border-b border-border/40 last:border-0"
                  >
                    {label}
                  </Link>
                ))}
                {user && (
                  <Link
                    href="/notifications"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between py-3 text-base font-medium text-muted-foreground hover:text-foreground transition-colors border-b border-border/40"
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

              {/* Mobile auth — logged-out only */}
              {!user && (
                <div className="flex gap-3 pt-1">
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="flex-1">
                    <Button variant="outline" className="w-full rounded-full">{t("nav.login")}</Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)} className="flex-1">
                    <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-full">{t("nav.register")}</Button>
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
