import { Link } from "wouter";
import { Instagram, Facebook } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";

export function Footer() {
  const { data } = useGetMe();
  const role = data?.user?.role;
  const showForPartners = !role || role === "user";

  return (
    <footer className="border-t border-border/60 bg-black/40 backdrop-blur mt-24">
      <div className="container mx-auto px-4 md:px-6 py-10 md:py-14 grid grid-cols-2 gap-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1 space-y-4">
          <Link href="/" className="inline-flex" aria-label="Royvento home">
            <Logo size={48} />
          </Link>
          <p className="text-white text-sm max-w-xs leading-relaxed">
            Heirloom-quality events. From estate weddings to founder summits and harvest festivals — Royvento is where remarkable hosts find remarkable craft.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a
              href="https://www.instagram.com/royvento_official/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="h-8 w-8 rounded-full border border-border/60 flex items-center justify-center text-white hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Instagram className="h-3.5 w-3.5" />
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61589731466561"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="h-8 w-8 rounded-full border border-border/60 flex items-center justify-center text-white hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Facebook className="h-3.5 w-3.5" />
            </a>
            {/* Twitter / X */}
            <a
              href="https://x.com/royvento_social?s=11"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter / X"
              className="h-8 w-8 rounded-full border border-border/60 flex items-center justify-center text-white hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            {/* Threads */}
            <a
              href="https://www.threads.com/@royvento_official?igshid=NTc4MTIwNjQ2YQ=="
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Threads"
              className="h-8 w-8 rounded-full border border-border/60 flex items-center justify-center text-white hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.751-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.366-.89h-.02c-.82 0-1.798.24-2.684 1.123l-1.912-2.223c1.252-1.252 2.811-1.938 4.578-1.938h.023c3.312.023 5.842 2.135 6.289 5.432l.016.12.14.062c1.208.537 2.168 1.37 2.777 2.41.878 1.522 1.026 3.476.415 5.385C20.01 21.624 17.08 24 12.186 24z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Discover */}
        <div className="space-y-3">
          <h4 className="font-semibold text-xs tracking-[0.18em] uppercase text-white">Discover</h4>
          <ul className="space-y-2.5 text-sm text-white">
            <li><Link href="/pubs" className="hover:text-foreground transition-colors">Browse Pubs</Link></li>
            <li><Link href="/pub-offers" className="hover:text-foreground transition-colors">Hot Deals</Link></li>
            <li><Link href="/subscription" className="hover:text-foreground transition-colors">Membership</Link></li>
            <li><Link href="/blogs" className="hover:text-foreground transition-colors">Blog</Link></li>
            <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
          </ul>
        </div>

        {/* For Partners — hidden for vendors and admins */}
        {showForPartners && (
        <div className="space-y-3">
          <h4 className="font-semibold text-xs tracking-[0.18em] uppercase text-white">For Partners</h4>
          <ul className="space-y-2.5 text-sm text-white">
            <li><Link href="/register" className="hover:text-foreground transition-colors">Become a Partner</Link></li>
            <li><Link href="/login" className="hover:text-foreground transition-colors">Partner Login</Link></li>
          </ul>
        </div>
        )}

        {/* Legal */}
        <div className="space-y-3">
          <h4 className="font-semibold text-xs tracking-[0.18em] uppercase text-white">Legal</h4>
          <ul className="space-y-2.5 text-sm text-white">
            <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link></li>
            <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
            <li><Link href="/about" className="hover:text-foreground transition-colors">About Us</Link></li>
          </ul>
        </div>

      </div>

      <div className="border-t border-border/40">
        <div className="container mx-auto px-4 md:px-6 py-5 text-xs text-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Royvento. All rights reserved.</span>
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
            <Link href="/terms" className="hover:text-muted-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
            <span className="font-serif italic hidden sm:inline text-white">Designed for hosts who notice the details.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
