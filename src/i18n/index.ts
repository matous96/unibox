/**
 * Internacionalizace (react-i18next).
 * Nový jazyk přidáte tak, že vytvoříte locales/<kód>.json se stejnými klíči
 * a zaregistrujete ho v poli LANGUAGES a v `resources` níže.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import cs from "./locales/cs.json";
import en from "./locales/en.json";

export const LANGUAGES = [
  { code: "cs", label: "Čeština" },
  { code: "en", label: "English" },
] as const;

/** Jazyk uložený v nastavení (čteno přímo, aby nevznikla cyklická závislost). */
function storedLanguage(): string {
  try {
    const raw = localStorage.getItem("unibox-settings");
    return (raw && JSON.parse(raw)?.state?.language) || "cs";
  } catch {
    return "cs";
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    cs: { translation: cs },
    en: { translation: en },
  },
  lng: storedLanguage(),
  fallbackLng: "cs",
  interpolation: { escapeValue: false }, // React escapuje sám
});

// Jazyk dokumentu (čtečky obrazovky, dělení slov) a titulek okna drží krok s jazykem aplikace
const syncDocument = () => {
  document.documentElement.lang = i18n.language;
  document.title = i18n.t("app.title");
};
syncDocument();
i18n.on("languageChanged", syncDocument);

export default i18n;
