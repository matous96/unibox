/**
 * Údaje pro automatická pravidla aktualizací (store/updateRules.ts):
 *  - firstSeen: kdy Unibox nabízenou verzi poprvé uviděl – pro minimální stáří
 *    aktualizací u verzí, jejichž datum vydání katalog nezná,
 *  - stuck: kolikrát aktualizace na verzi proběhla „úspěšně“, ale správce ji
 *    nabízí dál (winget u některých balíčků) – po N pokusech se přestane nabízet,
 *  - allowed: verze, které uživatel pustil i tak („Nabídnout hned / znovu“).
 * Klíč: „zdroj:id@verze“ (versionKey).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InstalledPackage } from "@/types";
import { pinKey } from "./updatePins";

/** Klíč verze balíčku: „winget:Mozilla.Firefox@132.0“. */
export const versionKey = (pkg: Pick<InstalledPackage, "source" | "packageId">, version: string) => `${pinKey(pkg)}@${version}`;

/** Jak dlouho držet záznamy o viděných verzích (dny) – starší se smažou. */
const KEEP_DAYS = 120;

interface UpdateHoldsState {
  firstSeen: Record<string, string>;
  stuck: Record<string, number>;
  allowed: Record<string, string>;
  /** Čas pro přepočet pravidel (mění se, když minimální stáří některé verze vyprší); neukládá se. */
  clock: number;
  /** Zapíše poprvé viděné nabízené verze a smaže staré záznamy. */
  see: (packages: InstalledPackage[]) => void;
  /** Aktualizace na verzi proběhla, ale správce ji nabízí dál. */
  recordStuck: (key: string) => void;
  /** Nabídnout verzi i přes pravidla (minimální stáří, neprojevená aktualizace). */
  allow: (key: string) => void;
  tick: () => void;
}

export const useUpdateHolds = create<UpdateHoldsState>()(
  persist(
    (set, get) => ({
      firstSeen: {},
      stuck: {},
      allowed: {},
      clock: Date.now(),
      see: (packages) => {
        const now = Date.now();
        const seen = get().firstSeen;
        const added: Record<string, string> = {};
        const offered = new Set<string>();
        for (const pkg of packages) {
          const version = pkg.availableVersion ?? pkg.heldVersion;
          if (!version) continue;
          const key = versionKey(pkg, version);
          offered.add(key);
          if (!seen[key]) added[key] = new Date(now).toISOString();
        }
        // Staré záznamy pryč, jen ne u verzí, které se pořád nabízejí (jinak by se jejich stáří vynulovalo)
        const limit = now - KEEP_DAYS * 24 * 60 * 60_000;
        const old = Object.keys(seen).filter((k) => Date.parse(seen[k]) < limit && !offered.has(k));
        if (!Object.keys(added).length && !old.length) return;
        const firstSeen = { ...seen, ...added };
        const stuck = { ...get().stuck };
        const allowed = { ...get().allowed };
        for (const key of old) {
          delete firstSeen[key];
          delete stuck[key];
          delete allowed[key];
        }
        set({ firstSeen, stuck, allowed });
      },
      recordStuck: (key) => set({ stuck: { ...get().stuck, [key]: (get().stuck[key] ?? 0) + 1 } }),
      allow: (key) => set({ allowed: { ...get().allowed, [key]: new Date().toISOString() } }),
      tick: () => set({ clock: Date.now() }),
    }),
    {
      name: "unibox-update-holds",
      partialize: ({ firstSeen, stuck, allowed }) => ({ firstSeen, stuck, allowed }),
    },
  ),
);
