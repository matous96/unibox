import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Jedna položka historie zobrazených balíčků. */
export interface RecentItem {
  id: string;
  /** Název a verze pro případ, že balíček v katalogu není. */
  name: string;
  version: string;
  viewedAt: string;
}

const MAX_ITEMS = 40;

interface RecentState {
  items: RecentItem[];
  /** Zaznamená zobrazení detailu (posune balíček na začátek seznamu). */
  record: (item: Omit<RecentItem, "viewedAt">) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/** Naposledy zobrazené balíčky – ukládají se mezi spuštěními. */
export const useRecent = create<RecentState>()(
  persist(
    (set, get) => ({
      items: [],
      record: (item) =>
        set({
          items: [
            { ...item, viewedAt: new Date().toISOString() },
            ...get().items.filter((i) => i.id !== item.id),
          ].slice(0, MAX_ITEMS),
        }),
      remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
      clear: () => set({ items: [] }),
    }),
    { name: "unibox-recent" },
  ),
);
