import { Link } from "wouter";
import { Crown, Instagram, Facebook, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-black/40 backdrop-blur mt-24">
      <div className="container mx-auto px-4 md:px-6 py-14 grid gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
        {/* Brand */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/favicon.svg"
              alt="Royvento"
              className="w-9 h-9 rounded-full object-cover"
              draggable={false}
            />
            <span className="font-serif font-bold text-xl tracking-tight text-primary">Royvento</span>
          </div>
          <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
            Heirloom-quality events. From estate weddings to founder summits and harvest festivals — Royvento is where remarkable hosts find remarkable craft.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="h-8 w-8 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Instagram className="h-3.5 w-3.5" />
            </a>
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="h-8 w-8 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Facebook className="h-3.5 w-3.5" />
            </a>
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              className="h-8 w-8 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Twitter className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Discover */}
        <div className="space-y-3">
          <h4 className="font-semibold text-xs tracking-[0.18em] uppercase text-foreground/70">Discover</h4>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li><Link href="/explore" className="hover:text-foreground transition-colors">Explore Events</Link></li>
            <li><Link href="/pubs" className="hover:text-foreground transition-colors">Browse Pubs</Link></li>
            <li><Link href="/pub-offers" className="hover:text-foreground transition-colors">Hot Deals</Link></li>
            <li><Link href="/blogs" className="hover:text-foreground transition-colors">Blog</Link></li>
            <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
          </ul>
        </div>

        {/* For Partners */}
        <div className="space-y-3">
          <h4 className="font-semibold text-xs tracking-[0.18em] uppercase text-foreground/70">For Partners</h4>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li><Link href="/register" className="hover:text-foreground transition-colors">Become a Partner</Link></li>
            <li><Link href="/login" className="hover:text-foreground transition-colors">Partner Login</Link></li>
            <li>
              <Link href="/subscription" className="hover:text-foreground transition-colors flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-primary" />
                Premium
              </Link>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div className="space-y-3">
          <h4 className="font-semibold text-xs tracking-[0.18em] uppercase text-foreground/70">Legal</h4>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link></li>
            <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
          </ul>
        </div>

      </div>

      <div className="border-t border-border/40">
        <div className="container mx-auto px-4 md:px-6 py-5 text-xs text-muted-foreground/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Royvento. All rights reserved.</span>
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
            <Link href="/terms" className="hover:text-muted-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
            <span className="font-serif italic hidden sm:inline text-muted-foreground/40">Designed for hosts who notice the details.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
