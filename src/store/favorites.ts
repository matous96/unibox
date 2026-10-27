import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Oblíbená aplikace (název a verze pro případ, že v katalogu není). */
export interface FavoriteItem {
  appId: string;
  name: string;
  version: string;
  addedAt: string;
}

interface FavoritesState {
  items: FavoriteItem[];
  toggle: (item: Omit<FavoriteItem, "addedAt">) => boolean;
  remove: (appId: string) => void;
}

/**
 * Oblíbené aplikace – ukládají se lokálně a po přihlášení se synchronizují
 * mezi počítači (store/sync.ts).
 */
export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      items: [],
      /** Přidá / odebere; vrací true, pokud je aplikace nově v oblíbených. */
      toggle: (item) => {
        const exists = get().items.some((i) => i.appId === item.appId);
        set({
          items: exists
            ? get().items.filter((i) => i.appId !== item.appId)
            : [{ ...item, addedAt: new Date().toISOString() }, ...get().items],
        });
        return !exists;
      },
      remove: (appId) => set({ items: get().items.filter((i) => i.appId !== appId) }),
    }),
    { name: "unibox-favorites" },
  ),
);
