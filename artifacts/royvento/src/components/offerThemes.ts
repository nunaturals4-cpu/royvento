/**
 * Per-category luxury colour system for the Pub Offers ticket cards, matched to
 * the approved black-and-gold mock:
 *
 *   🍸 Free Drinks          → Gold   (dark plate, gold accents)
 *   🎟 Included With Ticket → Purple (dark plate, lavender accents)
 *   🛡 Cover Charges        → Gold   (dark plate, gold accents)
 *   🍽 Food Discounts       → Champagne Gold (brighter gold plate)
 *   🥃 Drink Discounts      → Copper Bronze  (copper plate)
 *
 * Values are raw hex/rgba because they are consumed via inline styles + CSS
 * variables (dynamic values Tailwind's JIT can't statically extract).
 */
export interface OfferTheme {
  /** VIP left-plate gradient endpoints (135°). */
  from: string;
  to: string;
  /** Light tint used for the plate wordmark + embossed icon + halftone dots. */
  plateIcon: string;
  /** Accent for the dark right panel: day pills, header icon/underline, button. */
  accent: string;
  /** Soft rgba glow for hover shadow. */
  glow: string;
  /** rgba used for the hover border ring. */
  border: string;
}

export const OFFER_THEMES = {
  // 🍸 Free Drinks — Gold on a deep plate
  free: {
    from: "#2C2210", to: "#0B0A07", plateIcon: "#EBCB79", accent: "#D4A84B",
    glow: "rgba(212,168,75,0.30)", border: "rgba(212,168,75,0.50)",
  },
  // 🎟 Included With Ticket — Royal Purple
  ticket: {
    from: "#3A2A66", to: "#140E2B", plateIcon: "#E9E1FF", accent: "#9B8CE0",
    glow: "rgba(124,77,255,0.32)", border: "rgba(155,140,224,0.50)",
  },
  // 🛡 Cover Charges — Gold on a deep plate (matches Free Drinks in the mock)
  cover: {
    from: "#2A2412", to: "#0B0A08", plateIcon: "#EBCB79", accent: "#D4A84B",
    glow: "rgba(212,168,75,0.30)", border: "rgba(212,168,75,0.50)",
  },
  // 🍽 Food Discounts — Champagne Gold, brighter plate
  food: {
    from: "#B8892D", to: "#4A3716", plateIcon: "#FFF1C9", accent: "#D6B36A",
    glow: "rgba(200,155,72,0.30)", border: "rgba(200,155,72,0.50)",
  },
  // 🥃 Drink Discounts — Copper Bronze
  drink: {
    from: "#8A4F26", to: "#331D0C", plateIcon: "#FFE2C2", accent: "#C67B3E",
    glow: "rgba(182,106,54,0.30)", border: "rgba(182,106,54,0.50)",
  },
} satisfies Record<string, OfferTheme>;

export type OfferThemeKey = keyof typeof OFFER_THEMES;
