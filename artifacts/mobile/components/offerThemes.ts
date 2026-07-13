/**
 * Per-category luxury colour system for the VIP ticket offer cards — mirrors
 * web's src/components/offerThemes.ts. Keep both in sync; never rename a key.
 */
export interface OfferTheme {
  /** VIP left-plate gradient endpoints (top-left → bottom-right). */
  from: string;
  to: string;
  /** Light tint used for the plate wordmark + embossed icon. */
  plateIcon: string;
  /** Accent for the dark right panel: day pills, header icon, button. */
  accent: string;
  /** Soft rgba glow for active day pills / shadows. */
  glow: string;
  /** rgba used for the card border. */
  border: string;
}

export const OFFER_THEMES = {
  free: {
    from: "#2C2210", to: "#0B0A07", plateIcon: "#EBCB79", accent: "#D4A84B",
    glow: "rgba(212,168,75,0.30)", border: "rgba(212,168,75,0.50)",
  },
  ticket: {
    from: "#3A2A66", to: "#140E2B", plateIcon: "#E9E1FF", accent: "#9B8CE0",
    glow: "rgba(124,77,255,0.32)", border: "rgba(155,140,224,0.50)",
  },
  cover: {
    from: "#2A2412", to: "#0B0A08", plateIcon: "#EBCB79", accent: "#D4A84B",
    glow: "rgba(212,168,75,0.30)", border: "rgba(212,168,75,0.50)",
  },
  food: {
    from: "#B8892D", to: "#4A3716", plateIcon: "#FFF1C9", accent: "#D6B36A",
    glow: "rgba(200,155,72,0.30)", border: "rgba(200,155,72,0.50)",
  },
  drink: {
    from: "#8A4F26", to: "#331D0C", plateIcon: "#FFE2C2", accent: "#C67B3E",
    glow: "rgba(182,106,54,0.30)", border: "rgba(182,106,54,0.50)",
  },
  exclusive: {
    from: "#1F5A4C", to: "#0A1F1A", plateIcon: "#C9F5E4", accent: "#4FD1A5",
    glow: "rgba(79,209,165,0.30)", border: "rgba(79,209,165,0.50)",
  },
  vipTable: {
    from: "#3B1F5E", to: "#120A22", plateIcon: "#F0D9A8", accent: "#C89B48",
    glow: "rgba(168,111,232,0.32)", border: "rgba(200,155,72,0.50)",
  },
} satisfies Record<string, OfferTheme>;

export type OfferThemeKey = keyof typeof OFFER_THEMES;
