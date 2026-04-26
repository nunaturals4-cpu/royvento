import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { Crown } from "lucide-react";

export function Navbar() {
  const { data: me, refetch } = useGetMe({ query: { retry: false } as any });
  const logout = useLogout();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("royvento_token");
        refetch();
        setLocation("/");
      },
    });
  };

  const user = me?.user as any;

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl border-b border-white/10" />
      <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between relative">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 via-red-600 to-red-800 flex items-center justify-center red-glow">
                <span className="text-white font-bold font-serif text-lg">R</span>
              </div>
            </div>
            <span className="font-serif font-bold text-xl tracking-tight text-white">Royvento</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <Link href="/" className="text-white/70 hover:text-white transition-colors">Home</Link>
            <Link href="/explore" className="text-white/70 hover:text-white transition-colors">Events</Link>
            <Link href="/pubs" className="text-white/70 hover:text-white transition-colors">Pubs</Link>
            <Link href="/subscription" className="text-white/70 hover:text-white transition-colors flex items-center gap-1">
              <Crown className="h-3.5 w-3.5 text-primary" /> Premium
            </Link>
            <Link href="/contact" className="text-white/70 hover:text-white transition-colors">Contact</Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-white/5">
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
                    <p className="text-[10px] uppercase tracking-wider text-primary mt-1">{user.role}</p>
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
              <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition-colors hidden sm:block">
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
