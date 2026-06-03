/**
 * Royvento Mobile — Midnight Noir (Blood Red)
 * Background #000000 · Secondary BG #0D0D0D · Cards #111111
 * Primary Red #E8291C · Hover Red   #F54040 · Dark Red #991B1B
 * Text #FFFFFF · Secondary Text #A0A0A0 · Border #1F1F1F
 * Mirrors the web artifact's default :root palette.
 * The app uses a dark-only theme; both light and dark return the same tokens.
 */

const palette = {
  text: "#ffffff",
  tint: "#dc2626",

  /* #000000 — primary background */
  background: "#000000",
  foreground: "#ffffff",

  /* #111111 — cards */
  card: "#111111",
  cardForeground: "#ffffff",

  /* #E8291C — Blood Red primary; white text for contrast */
  primary: "#e8291c",
  primaryForeground: "#ffffff",
  primaryHover: "#f54040",

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

  red: "#dc2626",
  redHover: "#f54040",
  redDark: "#991b1b",
  redLight: "#fca5a5",
  overlay: "rgba(0,0,0,0.7)",
  success: "#16a34a",

  tabIconDefault: "#a0a0a0",
  tabIconSelected: "#dc2626",
};

const colors = {
  light: palette,
  dark: palette,
  radius: 14,
};

export default colors;
