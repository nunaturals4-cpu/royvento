import { cn } from "@/lib/utils";

/* Highlighted 7-day strip (M T W T F S S). Active days glow in the category
   accent colour; inactive days are dimmed. Days may arrive as "Mon"/"mon"/
   "monday" — we normalise to the 3-letter lowercase key. Empty or all-7 ⇒ every
   day lit. */
const DAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
] as const;

export function OfferDayPills({
  days,
  accent = "#8A919C",
  activeTextColor = "#0B0B0D",
  glow,
  className,
}: {
  days?: string[] | null;
  /** Category accent colour for active pills. */
  accent?: string;
  /** Text colour on active pills (matches the section button text). */
  activeTextColor?: string;
  /** Soft glow rgba for active pills. */
  glow?: string;
  className?: string;
}) {
  const set = new Set((days ?? []).map((d) => d.slice(0, 3).toLowerCase()));
  const isAll = set.size === 0 || set.size >= 7;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {DAYS.map((d, i) => {
        const active = isAll || set.has(d.key);
        return (
          <span
            key={i}
            className={cn(
              "flex h-[19px] w-[19px] items-center justify-center rounded-full text-[8.5px] font-bold leading-none select-none transition-colors",
              !active && "bg-white/[0.05] text-white/25",
            )}
            style={
              active
                ? { backgroundColor: accent, color: activeTextColor, boxShadow: glow ? `0 0 9px ${glow}` : undefined }
                : undefined
            }
          >
            {d.label}
          </span>
        );
      })}
    </div>
  );
}
