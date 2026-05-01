import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { Crown, Search, Bell, Menu, X as XIcon, MapPin, ChevronDown } from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { apiGet, apiPatch } from "@/lib/api";
import { useSelectedCity } from "@/components/LocationContext";
import { CityPickerModal } from "@/components/CityPickerModal";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useTranslation } from "react-i18next";

interface Notification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const THEMES: { id: Theme; label: string; color: string; bg: string }[] = [
  { id: "noir", label: "Midnight Noir", color: "#dc2626", bg: "#0D0D0D" },
  { id: "gold", label: "Royal Gold",    color: "#D4A017", bg: "#111016" },
  { id: "frost", label: "Arctic Frost", color: "#00a3e0", bg: "#F7F8FA" },
  { id: "dusk",  label: "Velvet Dusk",  color: "#dc5078", bg: "#0E0B14" },
];

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [tooltip, setTooltip] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Theme switcher">
      {THEMES.map((t) => {
        const isActive = theme === t.id;
        return (
          <div key={t.id} className="relative">
            <button
              onClick={() => setTheme(t.id)}
              onMouseEnter={() => setTooltip(t.id)}
              onMouseLeave={() => setTooltip(null)}
              aria-label={`Switch to ${t.label} theme`}
              aria-pressed={isActive}
              className="relative h-6 w-6 rounded-full transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ background: t.color }}
            >
              {isActive && (
                <span
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${t.color}` }}
                />
              )}
              <span
                className="absolute inset-0 rounded-full opacity-30"
                style={{ background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.6), transparent 70%)` }}
              />
            </button>
            {tooltip === t.id && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none whitespace-nowrap">
                <div className="glass-card-strong text-xs px-2 py-1 rounded-md text-foreground font-medium shadow-lg border border-border">
                  {t.label}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Navbar() {
  const { t } = useTranslation();
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const { selectedCity } = useSelectedCity();

  const user = me?.user as any;

  const loadNotifs = async () => {
    if (!user) return;
    try {
      const rows = await apiGet<Notification[]>("/api/notifications");
      setNotifs(rows);
    } catch {
    }
  };

  useEffect(() => {
    if (!user) { setNotifs([]); return; }
    loadNotifs();
    const t = setInterval(loadNotifs, 30000);
    return () => clearInterval(t);
  }, [user?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  const markRead = async (id: number) => {
    try {
      await apiPatch(`/api/notifications/${id}/read`, {});
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    const unread = notifs.filter((n) => !n.isRead);
    await Promise.all(unread.map((n) => markRead(n.id)));
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("royvento_token");
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
        <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-b border-border" />
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between relative gap-3">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="relative">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary via-primary to-primary/70 flex items-center justify-center red-glow">
                  <span className="text-primary-foreground font-bold font-serif text-lg">R</span>
                </div>
              </div>
              <span className="font-serif font-bold text-xl tracking-tight">Royvento</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">{t("nav.home")}</Link>
              <Link href="/pubs" className="text-muted-foreground hover:text-foreground transition-colors">{t("nav.pubs")}</Link>
              <Link href="/blogs" className="text-muted-foreground hover:text-foreground transition-colors">{t("nav.blog")}</Link>
              <Link href="/subscription" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <Crown className="h-3.5 w-3.5 text-primary" /> {t("nav.premium")}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <form onSubmit={handleSearch} className="relative hidden lg:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("nav.search_placeholder")}
                className="h-9 w-44 lg:w-60 pl-8 bg-card/60 border-border focus:border-primary/40"
              />
            </form>

            {/* City selector — desktop */}
            <button
              onClick={() => setCityModalOpen(true)}
              className="hidden lg:flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card/60 hover:border-primary/40 hover:bg-card/80 transition-colors text-sm min-w-0 max-w-[140px]"
              aria-label="Select city"
            >
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate text-sm font-medium text-foreground/80">
                {selectedCity || t("nav.select_city")}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>

            <span className="hidden lg:contents"><ThemeSwitcher /></span>
            <span className="hidden lg:contents"><LanguageSwitcher /></span>

            {user && (
              <div className="relative" ref={notifRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full hover:bg-foreground/5 relative"
                  onClick={() => { setNotifOpen((v) => !v); if (!notifOpen) loadNotifs(); }}
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
                  <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl glass-card-strong border border-border shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <p className="font-semibold text-sm">{t("nav.notifications")}</p>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
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
                            onClick={() => markRead(n.id)}
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
                  </div>
                )}
              </div>
            )}

            {/* Hamburger — mobile/tablet only */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9 rounded-full hover:bg-foreground/5"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-foreground/5">
                    <Avatar className="h-10 w-10 border border-primary/40 ring-2 ring-primary/10">
                      {user.profileImage ? <AvatarImage src={user.profileImage} /> : null}
                      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-60 glass-card-strong" align="end" forceMount>
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
                      <DropdownMenuItem asChild>
                        <Link href="/subscription" className="cursor-pointer w-full">{t("nav.partner_premium")}</Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {user.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="cursor-pointer w-full">{t("nav.admin_panel")}</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                    {t("nav.log_out")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden lg:block">
                  {t("nav.login")}
                </Link>
                <Link href="/register" className="hidden lg:block">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground red-glow border-0">
                    {t("nav.register")}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden relative border-t border-border bg-background/95 backdrop-blur-xl">
            <div className="container mx-auto px-4 py-4 space-y-4">
              {/* Mobile search */}
              <form onSubmit={(e) => { handleSearch(e); setMobileOpen(false); }} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("nav.search_placeholder")}
                  className="h-10 w-full pl-9 bg-card/60 border-border focus:border-primary/40"
                />
              </form>

              {/* Mobile city selector */}
              <button
                onClick={() => { setCityModalOpen(true); setMobileOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border border-border bg-card/40 hover:border-primary/40 transition-colors text-sm"
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
                <Link
                  href="/subscription"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-1.5 py-3 text-base font-medium text-muted-foreground hover:text-foreground transition-colors border-b border-border/40"
                >
                  <Crown className="h-4 w-4 text-primary" /> {t("nav.premium")}
                </Link>
              </nav>

              {/* Theme switcher */}
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2.5 font-medium uppercase tracking-wider">{t("nav.theme")}</p>
                <ThemeSwitcher />
              </div>

              {/* Language switcher */}
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">{t("nav.language")}</p>
                <LanguageSwitcher />
              </div>

              {/* Mobile auth — logged-out only */}
              {!user && (
                <div className="flex gap-3 pt-1">
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="flex-1">
                    <Button variant="outline" className="w-full">{t("nav.login")}</Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)} className="flex-1">
                    <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0">{t("nav.register")}</Button>
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
