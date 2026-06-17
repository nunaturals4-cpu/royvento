import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { type ThemeId } from "@/constants/colors";

const STORAGE_KEY = "@royvento/theme";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "noir",
  setTheme: () => {},
});

export function useThemeId() {
  return useContext(ThemeContext);
}

function isThemeId(v: unknown): v is ThemeId {
  return v === "noir" || v === "gold" || v === "dusk";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("noir");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (isThemeId(stored)) setThemeState(stored);
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
