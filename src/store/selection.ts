/**
 * Výběr aplikací zaškrtávátky na kartách a řádcích (hromadná instalace
 * a aktualizace). Výběr platí napříč stránkami – jde posbírat aplikace
 * z různých kategorií i hledání a spustit je najednou (lišta SelectionBar).
 * Mezi spuštěními se neukládá.
 */
import { create } from "zustand";
import type { CatalogEntry } from "@/types";

interface SelectionState {
  /** Vybrané aplikace podle id. */
  items: Record<string, CatalogEntry>;
  toggle: (entry: CatalogEntry) => void;
  /** Přidá do výběru (už vybrané nechá). */
  selectMany: (entries: CatalogEntry[]) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>()((set, get) => ({
  items: {},
  toggle: (entry) => {
    const items = { ...get().items };
    if (items[entry.id]) delete items[entry.id];
    else items[entry.id] = entry;
    set({ items });
  },
  selectMany: (entries) => {
    const items = { ...get().items };
    for (const entry of entries) items[entry.id] = entry;
    set({ items });
  },
  clear: () => set({ items: {} }),
}));
