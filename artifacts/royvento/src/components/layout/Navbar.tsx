import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { Crown, Search, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function Navbar() {
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState("");

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

  const user = me?.user as any;

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
