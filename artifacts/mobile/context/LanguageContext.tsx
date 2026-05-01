import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { i18n, initI18n, changeLanguage, LANGUAGES } from "@/utils/i18n";

interface LanguageContextValue {
  locale: string;
  setLocale: (code: string) => Promise<void>;
  t: (key: string, options?: Record<string, unknown>) => string;
  languages: typeof LANGUAGES;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  setLocale: async () => {},
  t: (key) => key,
  languages: LANGUAGES,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(i18n.locale);

  useEffect(() => {
    initI18n().then(() => {
      setLocaleState(i18n.locale);
    });
  }, []);

  const setLocale = useCallback(async (code: string) => {
    await changeLanguage(code);
    setLocaleState(code);
  }, []);

  const t = useCallback(
    (key: string, options?: Record<string, unknown>) => i18n.t(key, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
