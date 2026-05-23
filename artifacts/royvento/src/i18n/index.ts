import i18next from "i18next";
import { initReactI18next } from "react-i18next";

// Only English is bundled eagerly. The other locales are large (~30 KB each)
// and almost never used on first load, so they're code-split and fetched on
// demand when the user actually switches languages. This keeps the main entry
// chunk small and first paint fast.
import en from "./locales/en.json";

const STORAGE_KEY = "royvento_lang";

const savedLang = localStorage.getItem(STORAGE_KEY) ?? "en";

const localeLoaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  hi: () => import("./locales/hi.json"),
  bn: () => import("./locales/bn.json"),
  kn: () => import("./locales/kn.json"),
  te: () => import("./locales/te.json"),
  ta: () => import("./locales/ta.json"),
  pa: () => import("./locales/pa.json"),
  gu: () => import("./locales/gu.json"),
};

i18next.use(initReactI18next).init({
  lng: savedLang,
  fallbackLng: "en",
  resources: {
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

/**
 * Switch language, lazily fetching the locale bundle the first time it's used.
 * Use this instead of i18next.changeLanguage directly so the translations are
 * guaranteed to be loaded before the change takes effect.
 */
export async function setLanguage(lang: string): Promise<void> {
  if (lang !== "en" && !i18next.hasResourceBundle(lang, "translation")) {
    const loader = localeLoaders[lang];
    if (loader) {
      const mod = await loader();
      i18next.addResourceBundle(lang, "translation", mod.default, true, true);
    }
  }
  await i18next.changeLanguage(lang);
}

// Restore a previously-selected non-English language on startup.
if (savedLang !== "en") {
  void setLanguage(savedLang);
}

i18next.on("languageChanged", (lang) => {
  localStorage.setItem(STORAGE_KEY, lang);
});

export default i18next;
