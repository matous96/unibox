import { useEffect } from "react";
import { accentInk } from "@/lib/color";
import { useSettings } from "@/store/settings";

/**
 * Aplikuje motiv na <html>. Při volbě „Systém“ sleduje změny v systému.
 * Pokud systém světlý motiv výslovně nehlásí, zůstává tmavý (výchozí).
 *
 * Vlastní barva zvýraznění (Nastavení → Vzhled) přepíše proměnné --accent
 * a --accent-fg – přebarví se všechna tlačítka, odznaky a aktivní stavy
 * (Tailwind bg-accent, text-accent…) hned, bez restartu. V tmavém motivu
 * se barva mírně zesvětlí, stejně jako výchozí modrá.
 */
export function useTheme() {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accentColor);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && !media.matches);
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
      if (accent) {
        root.style.setProperty("--accent", dark ? `color-mix(in srgb, ${accent} 82%, white)` : accent);
        root.style.setProperty("--accent-fg", accentInk(accent));
      } else {
        root.style.removeProperty("--accent");
        root.style.removeProperty("--accent-fg");
      }
    };
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, accent]);
}
