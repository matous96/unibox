/**
 * Přes kterého správce Unibox aplikaci nainstaloval („chocolatey:aimp“).
 * Program s instalátorem z Chocolatey vidí i winget v registru Windows –
 * podle tohoto záznamu se v seznamu nainstalovaných ukáže pod správcem,
 * přes kterého byl nainstalován (štítek „Nainstalováno přes Chocolatey“,
 * aktualizace a odinstalace přes něj), i po restartu Uniboxu.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SourceId } from "@/types";

/** Klíč: zdroj a id balíčku ve správci. */
export const viaKey = (source: SourceId, packageId: string) => `${source}:${packageId.toLowerCase()}`;

interface InstalledViaState {
  keys: string[];
  /** Úspěšná instalace přes správce. */
  installed: (source: SourceId, packageId: string) => void;
  /** Úspěšná odinstalace – záznam už neplatí. */
  removed: (source: SourceId, packageId: string) => void;
}

export const useInstalledVia = create<InstalledViaState>()(
  persist(
    (set, get) => ({
      keys: [],
      installed: (source, packageId) => {
        const key = viaKey(source, packageId);
        if (!get().keys.includes(key)) set({ keys: [...get().keys, key] });
      },
      removed: (source, packageId) => set({ keys: get().keys.filter((k) => k !== viaKey(source, packageId)) }),
    }),
    { name: "unibox-installed-via" },
  ),
);
