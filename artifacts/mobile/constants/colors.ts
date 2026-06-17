/**
 * Royvento Mobile — themeable palettes.
 *
 * Mirrors the web artifact's `[data-theme]` system (ThemeProvider + index.css).
 * Per the web design, every theme keeps the same pure-black Noir surfaces
 * (background / card / border / muted) and only swaps the ACCENT colour
 * (primary / primary-foreground / glow). This avoids the "blurry" look that a
 * non-black background caused on the web side.
 *
 *   • Midnight Noir — Blood Red  (#E8291C)  — default
 *   • Royal Gold    — Gold        (#F0B429)
 *   • Velvet Dusk   — Rose         (#E24F80)
 */

export type ThemeId = "noir" | "gold" | "dusk";

/** Shared pure-black surfaces for every theme. */
const base = {
  text: "#ffffff",

  /* #000000 — primary background */
  background: "#000000",
  foreground: "#ffffff",

  /* #111111 — cards */
  card: "#111111",
  cardForeground: "#ffffff",

  /* White secondary — matches the outline button style */
  secondary: "#ffffff",
  secondaryForeground: "#0a0a0a",

  /* Muted surfaces */
  muted: "#0d0d0d",
  mutedForeground: "#a0a0a0",

  accent: "#1a1a1a",
  accentForeground: "#ffffff",

  destructive: "#dc2626",
  destructiveForeground: "#ffffff",

  /* #1F1F1F — border */
  border: "#1f1f1f",
  /* #0D0D0D — secondary bg / inputs */
  input: "#0d0d0d",

  overlay: "rgba(0,0,0,0.7)",
  success: "#16a34a",
  green: "#16a34a",
  greenHover: "#22c55e",
  greenLight: "#bbf7d0",

  tabIconDefault: "#a0a0a0",
};

/** Per-theme accent overrides (primary / glow). */
interface Accent {
  primary: string;
  primaryForeground: string;
  primaryHover: string;
  /** "r, g, b" used for translucent glow/shadow expressions. */
  glowRgb: string;
}

const ACCENTS: Record<ThemeId, Accent> = {
  noir: { primary: "#e8291c", primaryForeground: "#ffffff", primaryHover: "#f54040", glowRgb: "232, 41, 28" },
  gold: { primary: "#f0b429", primaryForeground: "#0a0a0a", primaryHover: "#f5c44a", glowRgb: "212, 160, 23" },
  dusk: { primary: "#e24f80", primaryForeground: "#ffffff", primaryHover: "#ea6e97", glowRgb: "220, 80, 120" },
};

const RADIUS = 14;

export function getPalette(theme: ThemeId) {
  const accent = ACCENTS[theme] ?? ACCENTS.noir;
  return {
    ...base,
    tint: accent.primary,
    primary: accent.primary,
    primaryForeground: accent.primaryForeground,
    primaryHover: accent.primaryHover,
    glowRgb: accent.glowRgb,

    /* Legacy red.* aliases kept for back-compat; now follow the active accent. */
    red: accent.primary,
    redHover: accent.primaryHover,
    redDark: "#991b1b",
    redLight: "#fca5a5",

    tabIconSelected: accent.primary,
    radius: RADIUS,
  };
}

export type Palette = ReturnType<typeof getPalette>;

/** Theme metadata for the picker UI. */
export const THEMES: { id: ThemeId; label: string; color: string }[] = [
  { id: "noir", label: "Midnight Noir", color: "#e8291c" },
  { id: "gold", label: "Royal Gold", color: "#f0b429" },
  { id: "dusk", label: "Velvet Dusk", color: "#e24f80" },
];

/* Default export kept for any direct consumers (Noir). */
const colors = {
  light: getPalette("noir"),
  dark: getPalette("noir"),
  radius: RADIUS,
};

export default colors;
