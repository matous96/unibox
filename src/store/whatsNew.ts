/**
 * „Co je nového“ po aktualizaci HubGetu. Pamatuje si poslední spuštěnou verzi
 * (localStorage); je-li aktuální verze novější, WhatsNewDialog ukáže novinky
 * všech vydání od té doby (data/changelog.ts). Zavřením dialogu se aktuální
 * verze uloží jako zobrazená, takže se příště neukáže.
 *
 * Čistá instalace (první spuštění vůbec) dialog neukazuje – verze se jen uloží.
 * Kdo aktualizoval z verze, která si verzi ještě neukládala (nic uloženého, ale
 * HubGet už dřív běžel), uvidí novinky aktuální verze.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CHANGELOG, type Release } from "@/data/changelog";
import { compareVersions } from "@/lib/version";

const STORAGE_KEY = "unibox-whats-new";

/** Nejvýš tolik vydání najednou (kdo dlouho neaktualizoval, nedostane román). */
const MAX_RELEASES = 5;

/**
 * Běžel už HubGet dřív? Zjišťuje se při načtení modulu – dřív, než ostatní
 * úložiště při tomto spuštění cokoli zapíšou. Sdílí ho úvodní průvodce
 * (store/onboarding.ts) – kdo HubGet už používal, ten ho sám neuvidí.
 */
export const HAD_PREVIOUS_RUN = (() => {
  try {
    return Object.keys(localStorage).some((key) => key.startsWith("unibox-") && key !== STORAGE_KEY && key !== "unibox-onboarding");
  } catch {
    return false;
  }
})();

interface WhatsNewState {
  /** Poslední verze, pro kterou uživatel novinky viděl (nebo která běžela). */
  lastSeenVersion: string | null;
  markSeen: (version: string) => void;
}

export const useWhatsNew = create<WhatsNewState>()(
  persist(
    (set) => ({
      lastSeenVersion: null,
      markSeen: (lastSeenVersion) => set({ lastSeenVersion }),
    }),
    { name: STORAGE_KEY },
  ),
);

/**
 * Ruční otevření okna „Co je nového“ (Nastavení → Novinky) – třeba když ho
 * uživatel omylem zavřel. Každé zavolání `show` okno otevře znovu.
 */
export const useWhatsNewRequest = create<{ requested: number; show: () => void }>()((set, get) => ({
  requested: 0,
  show: () => set({ requested: get().requested + 1 }),
}));

/**
 * Vydání, jejichž novinky uživatel ještě neviděl (nejnovější první): od uložené
 * verze (bez ní) po aktuální (včetně). Prázdné = dialog neukazovat.
 */
export function unseenReleases(lastSeen: string | null, current: string, hadPreviousRun = HAD_PREVIOUS_RUN): Release[] {
  if (!lastSeen) {
    // Čistá instalace – nic; aktualizace ze starší verze bez záznamu – jen aktuální vydání
    return hadPreviousRun ? CHANGELOG.filter((release) => release.version === current) : [];
  }
  return CHANGELOG.filter(
    (release) => compareVersions(release.version, lastSeen) > 0 && compareVersions(release.version, current) <= 0,
  ).slice(0, MAX_RELEASES);
}
