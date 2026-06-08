import { Children, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── CarouselRow ──────────────────────────────────────────────────────────────
// A single-row, horizontally-scrollable rail with left/right arrow controls.
// Used to give every homepage/discovery section a consistent "one row, scroll
// for more" behaviour instead of wrapping cards onto a second row. Arrows only
// appear when there is content to scroll to in that direction.
//
// Each child is wrapped in a non-shrinking slot so the row never wraps. Pass
// `itemClassName` to size cards that don't already carry their own width
// (e.g. "w-[280px]"); children that already set a width can omit it.

interface CarouselRowProps {
  children: React.ReactNode;
  /** Width/extra classes applied to each item slot, e.g. "w-[280px] sm:w-[300px]". */
  itemClassName?: string;
  /** Gap utility between items. */
  gapClass?: string;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

export function CarouselRow({
  children,
  itemClassName,
  gapClass = "gap-4 md:gap-5",
  className,
}: CarouselRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 4);
    setCanRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const scrollByDir = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const arrowBase =
    "absolute top-1/2 z-20 -translate-y-1/2 hidden h-10 w-10 items-center justify-center rounded-full " +
    "border border-white/15 bg-black/70 text-white backdrop-blur-sm transition-all hover:bg-primary hover:border-primary " +
    "hover:text-primary-foreground active:scale-90 sm:flex";

  return (
    <div className={cn("group/carousel relative", className)}>
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByDir(-1)}
        className={cn(arrowBase, "left-1 md:-left-3", !canLeft && "pointer-events-none opacity-0")}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div
        ref={scrollRef}
        onScroll={update}
        className={cn(
          "flex snap-x snap-mandatory overflow-x-auto scrollbar-none pb-4 [&>*]:shrink-0",
          gapClass,
        )}
      >
        {Children.map(children, (child) =>
          child == null ? null : (
            <div className={cn("snap-start", itemClassName)}>{child}</div>
          ),
        )}
      </div>

      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByDir(1)}
        className={cn(arrowBase, "right-1 md:-right-3", !canRight && "pointer-events-none opacity-0")}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
