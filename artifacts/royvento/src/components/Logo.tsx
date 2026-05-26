import { cn } from "@/lib/utils";

/**
 * Royvento brand mark.
 *
 *  - variant="lockup" (default): crest icon + "Royvento" serif wordmark, for
 *    navbars, footers and sidebars where horizontal space is available.
 *  - variant="icon": crest only, for tight/square spots.
 *  - variant="full": the complete crest + wordmark artwork image, for hero,
 *    auth cards, splash and loading states.
 *
 * The gold artwork has a transparent background so it sits cleanly on any
 * theme (light or dark).
 */
type LogoVariant = "lockup" | "icon" | "full";

interface LogoProps {
  variant?: LogoVariant;
  /** Pixel height of the crest icon (lockup/icon) or the artwork (full). */
  size?: number;
  className?: string;
  /** Hide the wordmark text in the lockup (e.g. very narrow viewports). */
  hideWordmark?: boolean;
}

export function Logo({ variant = "lockup", size = 36, className, hideWordmark }: LogoProps) {
  if (variant === "full") {
    return (
      <img
        src="/images/logo.png"
        alt="Royvento — Turning visions into reality"
        height={size}
        style={{ height: size }}
        className={cn("w-auto select-none", className)}
        draggable={false}
      />
    );
  }

  const icon = (
    <img
      src="/images/logo-icon.png"
      alt="Royvento"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="object-contain select-none shrink-0"
      draggable={false}
    />
  );

  if (variant === "icon") {
    return <span className={cn("inline-flex", className)}>{icon}</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {icon}
      {!hideWordmark && (
        <span className="font-serif font-bold text-xl tracking-tight">Royvento</span>
      )}
    </span>
  );
}
