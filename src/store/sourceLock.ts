/**
 * Režim jednoho zdroje: klik na správce v levém panelu „zamkne“ katalog na
 * tento zdroj.
 *  - přehledy (domů, kategorie, žebříček, hledání…) ukazují jen aplikace z něj,
 *  - instalace se nabízí jen z něj, jako by ostatní zdroje neexistovaly
 *    (detail, „Instalovat vše“, hromadný výběr; záložní zdroj se nenabízí),
 *  - lišta pod horní lištou (SourceLockBar) režim ukazuje a jedním klikem ruší.
 * Správci pro vývojáře (npm, pip, Cargo…) v katalogu aplikací nejsou – místo
 * přehledů katalogu se ukáže přehled správce (DevSourceOverview) a hledá se
 * jen v jeho registru.
 * Nainstalované aplikace se dál zjišťují u všech správců (useInstalled) – zámek
 * je jen pohled na katalog. Platí do zrušení nebo do zavření Uniboxu.
 */
import { useMemo } from "react";
import { create } from "zustand";
import { getSource } from "@/services/managers";
import type { CatalogEntry, SourceId, UserMode } from "@/types";
import { activeSources, useSettings } from "./settings";

interface SourceLockState {
  /** Zamčený zdroj, null = všechny zapnuté zdroje. */
  source: SourceId | null;
  select: (source: SourceId) => void;
  clear: () => void;
}

export const useSourceLock = create<SourceLockState>()((set) => ({
  source: null,
  select: (source) => set({ source }),
  clear: () => set({ source: null }),
}));

/** Je zamčený správce pro vývojáře (npm, pip, Cargo…)? */
export const isDevLock = (lock: SourceId | null): lock is SourceId => !!lock && getSource(lock).group === "dev";

export interface SourceScope {
  /** Zdroje, ze kterých jde instalovat (při zámku jen zamčený). */
  enabled: SourceId[];
  preferred: SourceId;
  /** Zamčený zdroj (jen pokud je v Nastavení zapnutý). */
  lock: SourceId | null;
}

function scopeOf(enabled: SourceId[], userMode: UserMode, preferred: SourceId, lock: SourceId | null): SourceScope {
  // Správci pro vývojáře jen v režimu Vývojář
  const active = activeSources(enabled, userMode);
  return lock && active.includes(lock) ? { enabled: [lock], preferred: lock, lock } : { enabled: active, preferred, lock: null };
}

/** Zdroje pro výběr instalace s ohledem na zámek a režim (místo enabledSources / preferredSource z Nastavení). */
export function useSourceScope(): SourceScope {
  const enabled = useSettings((s) => s.enabledSources);
  const userMode = useSettings((s) => s.userMode);
  const preferred = useSettings((s) => s.preferredSource);
  const lock = useSourceLock((s) => s.source);
  return useMemo(() => scopeOf(enabled, userMode, preferred, lock), [enabled, userMode, preferred, lock]);
}

/** Totéž mimo React (fronta úloh). */
export function sourceScope(): SourceScope {
  const { enabledSources, userMode, preferredSource } = useSettings.getState();
  return scopeOf(enabledSources, userMode, preferredSource, useSourceLock.getState().source);
}

/** Patří aplikace do zamčeného zdroje? Bez zámku vždy. */
export const inLockedSource = (entry: CatalogEntry, lock: SourceId | null) =>
  !lock || entry.sources.some((s) => s.source === lock);
