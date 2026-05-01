import { I18n } from "i18n-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import bn from "./locales/bn.json";
import kn from "./locales/kn.json";
import te from "./locales/te.json";
import ta from "./locales/ta.json";
import pa from "./locales/pa.json";
import gu from "./locales/gu.json";

const STORAGE_KEY = "@royvento/lang";

export const i18n = new I18n({
  en,
  hi,
  bn,
  kn,
  te,
  ta,
  pa,
  gu,
});

i18n.enableFallback = true;
i18n.defaultLocale = "en";
i18n.locale = "en";

export async function initI18n(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && i18n.translations[saved]) {
      i18n.locale = saved;
    } else {
      const systemLocale = getLocales()[0]?.languageCode ?? "en";
      i18n.locale = i18n.translations[systemLocale] ? systemLocale : "en";
    }
  } catch {
    i18n.locale = "en";
  }
}

export async function changeLanguage(code: string): Promise<void> {
  i18n.locale = code;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {}
}

export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

export const LANGUAGES = [
  { code: "en", native: "English",   english: "English"  },
  { code: "hi", native: "हिंदी",      english: "Hindi"    },
  { code: "bn", native: "বাংলা",      english: "Bengali"  },
  { code: "kn", native: "ಕನ್ನಡ",      english: "Kannada"  },
  { code: "te", native: "తెలుగు",    english: "Telugu"   },
  { code: "ta", native: "தமிழ்",     english: "Tamil"    },
  { code: "pa", native: "ਪੰਜਾਬੀ",    english: "Punjabi"  },
  { code: "gu", native: "ગુજરાતી",   english: "Gujarati" },
] as const;
