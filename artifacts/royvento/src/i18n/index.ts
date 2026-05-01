import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import bn from "./locales/bn.json";
import kn from "./locales/kn.json";
import te from "./locales/te.json";
import ta from "./locales/ta.json";
import pa from "./locales/pa.json";
import gu from "./locales/gu.json";

const STORAGE_KEY = "royvento_lang";

const savedLang = localStorage.getItem(STORAGE_KEY) ?? "en";

i18next.use(initReactI18next).init({
  lng: savedLang,
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    bn: { translation: bn },
    kn: { translation: kn },
    te: { translation: te },
    ta: { translation: ta },
    pa: { translation: pa },
    gu: { translation: gu },
  },
  interpolation: { escapeValue: false },
});

i18next.on("languageChanged", (lang) => {
  localStorage.setItem(STORAGE_KEY, lang);
});

export default i18next;
