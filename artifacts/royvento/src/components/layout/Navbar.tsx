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
import { Crown, Search, Sun, Moon, Bell } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet, apiPatch } from "@/lib/api";

interface Notification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function Navbar() {
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState("");
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

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
    setLocation(term ? `/explore?search=${encodeURIComponent(term)}` : "/explore");
  };

  const unreadCount = notifs.filter((n) => !n.isRead).length;

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-b border-border" />
      <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between relative gap-3">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="relative">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 via-red-600 to-red-800 flex items-center justify-center red-glow">
                <span className="text-white font-bold font-serif text-lg">R</span>
              </div>
            </div>
            <span className="font-serif font-bold text-xl tracking-tight">Royvento</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">Home</Link>
            <Link href="/explore" className="text-muted-foreground hover:text-foreground transition-colors">Event Explorer</Link>
            <Link href="/pubs" className="text-muted-foreground hover:text-foreground transition-colors">Pubs</Link>
            <Link href="/subscription" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Crown className="h-3.5 w-3.5 text-primary" /> Premium
            </Link>
            <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <form onSubmit={handleSearch} className="relative hidden md:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search events, pubs…"
              className="h-9 w-44 lg:w-60 pl-8 bg-card/60 border-border focus:border-primary/40"
            />
          </form>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
            className="h-9 w-9 rounded-full hover:bg-foreground/5"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

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
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>

              {notifOpen && (
                <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl glass-card-strong border border-border shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <p className="font-semibold text-sm">Notifications</p>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-primary hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No notifications yet</p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                      {notifs.map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors ${!n.isRead ? "bg-red-900/10" : ""}`}
                          onClick={() => markRead(n.id)}
                        >
                          <div className="flex items-start gap-2">
                            {!n.isRead && (
                              <span className="mt-1.5 h-2 w-2 rounded-full bg-red-500 shrink-0" />
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

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-foreground/5">
                  <Avatar className="h-10 w-10 border border-primary/40 ring-2 ring-primary/10">
                    {user.profileImage ? <AvatarImage src={user.profileImage} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-red-600 to-red-900 text-white font-semibold">
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
                  <Link href="/dashboard/profile" className="cursor-pointer w-full">My profile</Link>
                </DropdownMenuItem>
                {user.role === "user" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/bookings" className="cursor-pointer w-full">My bookings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/subscription" className="cursor-pointer w-full">Subscription</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/become-vendor" className="cursor-pointer w-full">Become a partner</Link>
                    </DropdownMenuItem>
                  </>
                )}
                {user.role === "vendor" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/bookings" className="cursor-pointer w-full">My bookings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/partner" className="cursor-pointer w-full">Partner dashboard</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/subscription" className="cursor-pointer w-full">Partner premium</Link>
                    </DropdownMenuItem>
                  </>
                )}
                {user.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer w-full">Admin panel</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
                Log in
              </Link>
              <Link href="/register">
                <Button className="bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 red-glow border-0">
                  Get started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
