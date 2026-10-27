import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/store/settings";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** Hlásí systém světlý motiv? (sleduje změny – kvůli volbě „Systém“) */
function useSystemLight() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(LIGHT_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(LIGHT_QUERY).matches,
  );
}

/**
 * Přepínač tmavý / světlý režim v horní liště. Ikona ukazuje aktuální režim
 * (měsíc = tmavý, slunce = světlý), kliknutí přepne na opačný. Při volbě
 * „Systém“ vychází z režimu Windows; vrátit se k ní jde v Nastavení.
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const systemLight = useSystemLight();
  // Stejné pravidlo jako useTheme: bez výslovně světlého systému je tmavý
  const dark = theme === "dark" || (theme === "system" && !systemLight);
  const label = dark ? t("theme.toLight") : t("theme.toDark");

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={dark ? "dark" : "light"}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex"
        >
          {dark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
