import { Gift, Beer, Armchair, Ticket } from "lucide-react";

/**
 * Premium scrolling promo bar shown directly beneath the navbar. The message
 * list is rendered twice inside a single animated track so the CSS marquee
 * (`rv-marquee` in index.css) loops seamlessly. Pauses on hover, respects
 * prefers-reduced-motion, and is fully responsive (font/padding scale down on
 * mobile). Decorative only — `aria-hidden` on the duplicated copy.
 */
const PROMO_ITEMS = [
  { icon: Gift, text: "New users get 200 FREE Royvento Coins" },
  { icon: Beer, text: "Book only through Royvento to unlock Free Entry" },
  { icon: Armchair, text: "Enjoy Free Table Booking at Partner Venues" },
  { icon: Ticket, text: "Exclusive Offers Available Only on Royvento" },
];

function MarqueeGroup({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div className="rv-marquee-track" aria-hidden={ariaHidden}>
      {PROMO_ITEMS.map(({ icon: Icon, text }, i) => (
        <span
          key={`${text}-${i}`}
          className="inline-flex items-center gap-2 px-5 md:px-8 text-[11px] md:text-[13px] font-medium tracking-wide text-foreground/90"
        >
          <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary shrink-0" />
          <span className="whitespace-nowrap">{text}</span>
          <span className="ml-3 md:ml-5 h-1 w-1 rounded-full bg-primary/50 shrink-0" />
        </span>
      ))}
    </div>
  );
}

export function PromoMarquee() {
  return (
    <div className="relative w-full overflow-hidden border-b border-primary/15 bg-gradient-to-r from-primary/[0.08] via-background to-primary/[0.08]">
      {/* Edge fades for a premium, non-spammy feel */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 md:w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 md:w-24 bg-gradient-to-l from-background to-transparent" />
      <div className="rv-marquee-mask flex w-full select-none py-2 md:py-2.5">
        <MarqueeGroup />
        <MarqueeGroup ariaHidden />
      </div>
    </div>
  );
}
