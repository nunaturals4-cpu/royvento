import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "noir" | "gold" | "frost" | "dusk";
const STORAGE_KEY = "royvento_theme";

interface Ctx { theme: Theme; setTheme: (t: Theme) => void; }
const ThemeContext = createContext<Ctx | null>(null);

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.dataset["theme"] = t;
  if (t === "frost") {
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "noir";
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "noir" || stored === "gold" || stored === "frost" || stored === "dusk") return stored;
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy === "light") return "frost";
    } catch {}
    return "noir";
  });

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
