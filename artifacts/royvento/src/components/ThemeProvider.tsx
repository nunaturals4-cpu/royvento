import { useEffect } from "react";

/**
 * Royvento uses a single premium identity — Noir Green:
 * bg #000000 · secondary bg #101010 · cards #1A1A1A
 * green #4CAF50 (hover #66BB6A) · dark green #1B5E20
 * text #FFFFFF · secondary text #BDBDBD · border #2A2A2A
 * The previous multi-theme switcher has been removed in favour of one cohesive
 * brand look. This provider simply applies the theme on mount.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset["theme"] = "noir";
    root.classList.add("dark");
  }, []);

  return <>{children}</>;
}
