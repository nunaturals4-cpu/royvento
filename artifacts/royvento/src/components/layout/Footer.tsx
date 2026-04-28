import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t bg-card mt-24">
      <div className="container mx-auto px-4 md:px-6 py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold font-serif text-lg">R</span>
            </div>
            <span className="font-serif font-bold text-xl tracking-tight text-primary">Royvento</span>
          </div>
          <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
            Heirloom-quality events. From estate weddings to founder summits and harvest festivals — Royvento is where remarkable hosts find remarkable craft.
          </p>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-sm tracking-wide uppercase text-foreground">Discover</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/explore" className="hover:text-foreground">Explore Events</Link></li>
            <li><Link href="/vendors" className="hover:text-foreground">Browse Partners</Link></li>
            <li><Link href="/contact" className="hover:text-foreground">Contact</Link></li>
          </ul>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-sm tracking-wide uppercase text-foreground">For Partners</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/register" className="hover:text-foreground">Become a Partner</Link></li>
            <li><Link href="/login" className="hover:text-foreground">Partner Login</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="container mx-auto px-4 md:px-6 py-5 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Royvento. Crafted with care.</span>
          <span className="font-serif italic">Designed for hosts who notice the details.</span>
        </div>
      </div>
    </footer>
  );
}
