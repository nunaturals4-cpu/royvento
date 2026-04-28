/**
 * Royvento Mobile — Royal Gold theme
 * Derived from sibling web artifact's [data-theme="gold"] palette.
 * The app uses a dark-only theme; both light and dark return the same tokens.
 */

const palette = {
  text: "#f5f3ee",
  tint: "#d4a017",

  background: "#0e0d12",
  foreground: "#f5f3ee",

  card: "#16151a",
  cardForeground: "#f5f3ee",

  primary: "#d4a017",
  primaryForeground: "#0d0d0d",

  secondary: "#232229",
  secondaryForeground: "#f5f3ee",

  muted: "#232229",
  mutedForeground: "#9c9ba5",

  accent: "#1e1c24",
  accentForeground: "#f5f3ee",

  destructive: "#e53935",
  destructiveForeground: "#ffffff",

  border: "#2c2b32",
  input: "#2c2b32",

  gold: "#d4a017",
  goldLight: "#e8c050",
  overlay: "rgba(0,0,0,0.7)",
  success: "#4caf50",

  tabIconDefault: "#9c9ba5",
  tabIconSelected: "#d4a017",
};

const colors = {
  light: palette,
  dark: palette,
  radius: 14,
};

export default colors;
