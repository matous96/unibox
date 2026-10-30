/**
 * Sada balíčků – seznam aplikací k hromadné instalaci (jedním kliknutím,
 * nebo vygenerovaným skriptem .ps1). Aktuální sada se ukládá mezi spuštěními,
 * dá se uložit do souboru .ubundle a zase otevřít (i na jiném počítači).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isSourceId } from "@/services/managers/sources";
import type { InstallOptions, SourceId } from "@/types";
import { sanitizeImportedOptions } from "./security";
import { isUpdatePin, type UpdatePins } from "./updatePins";

export interface BundleItem {
  appId: string;
  name: string;
  source: SourceId;
  packageId: string;
  /** Konkrétní verze; vynecháno = nejnovější. */
  version?: string;
  /**
   * Volby instalace (jako správce, rozsah, vlastní argumenty, příkazy před /
   * po instalaci). Při importu sady se vlastní argumenty a příkazy převezmou
   * jen s povolením v Nastavení → Oprávnění správce (parseBundleFile).
   */
  options?: InstallOptions;
}

/** Nastavení aplikací přenášené s profilem počítače (lib/profile.ts). */
export interface ProfileConfig {
  /** Ignorované, přeskočené a odložené aktualizace (klíč „zdroj:id balíčku“). */
  pins?: UpdatePins;
  /** Aplikace s automatickou aktualizací v režimu „Jen vybrané“ (klíč „zdroj:id balíčku“). */
  autoUpdate?: string[];
}

/** Formát souboru sady (.ubundle, uvnitř JSON). */
export interface BundleFile {
  format: "unibox-bundle";
  version: 1;
  name: string;
  createdAt: string;
  packages: BundleItem[];
  /** Jen u profilu počítače – starší verze HubGetu pole ignorují. */
  config?: ProfileConfig;
}

interface BundleState {
  name: string;
  items: BundleItem[];
  /** Id aplikací vybraných zaškrtávátkem. */
  selected: string[];
  add: (item: BundleItem) => void;
  remove: (appIds: string[]) => void;
  toggle: (item: BundleItem) => void;
  has: (appId: string) => boolean;
  update: (appId: string, changes: Partial<BundleItem>) => void;
  toggleSelected: (appId: string) => void;
  selectAll: (select: boolean) => void;
  rename: (name: string) => void;
  reset: () => void;
  load: (file: BundleFile) => void;
  toFile: () => BundleFile;
}

export const useBundle = create<BundleState>()(
  persist(
    (set, get) => ({
      name: "",
      items: [],
      selected: [],

      add: (item) => {
        // Stejná aplikace jen jednou – novější volba (zdroj, verze) přepíše starší
        const items = get().items.filter((i) => i.appId !== item.appId);
        set({ items: [...items, item], selected: [...new Set([...get().selected, item.appId])] });
      },
      remove: (appIds) =>
        set({
          items: get().items.filter((i) => !appIds.includes(i.appId)),
          selected: get().selected.filter((id) => !appIds.includes(id)),
        }),
      toggle: (item) => (get().has(item.appId) ? get().remove([item.appId]) : get().add(item)),
      has: (appId) => get().items.some((i) => i.appId === appId),
      update: (appId, changes) =>
        set({ items: get().items.map((i) => (i.appId === appId ? { ...i, ...changes } : i)) }),
      toggleSelected: (appId) => {
        const selected = get().selected;
        set({ selected: selected.includes(appId) ? selected.filter((id) => id !== appId) : [...selected, appId] });
      },
      selectAll: (select) => set({ selected: select ? get().items.map((i) => i.appId) : [] }),
      rename: (name) => set({ name }),
      reset: () => set({ name: "", items: [], selected: [] }),

      load: (file) =>
        set({
          name: file.name,
          items: file.packages,
          selected: file.packages.map((p) => p.appId),
        }),
      toFile: () => ({
        format: "unibox-bundle",
        version: 1,
        name: get().name,
        createdAt: new Date().toISOString(),
        packages: get().items,
      }),
    }),
    {
      name: "unibox-bundle",
      // Položky se zdrojem, který HubGet už nepodporuje, zahodit
      merge: (persisted, current) => {
        const saved = persisted as Partial<BundleState> | undefined;
        const items = (saved?.items ?? []).filter((i) => isSourceId(i.source));
        const ids = new Set(items.map((i) => i.appId));
        return { ...current, ...saved, items, selected: (saved?.selected ?? []).filter((id) => ids.has(id)) };
      },
    },
  ),
);

/** Ověří a načte obsah souboru sady; při chybném formátu vyhodí výjimku. */
export function parseBundleFile(text: string): BundleFile {
  const data = JSON.parse(text) as Partial<BundleFile>;
  if (data.format !== "unibox-bundle" || !Array.isArray(data.packages)) throw new Error("invalid bundle");
  const packages = data.packages
    .filter(
      (p): p is BundleItem =>
        !!p && typeof p.appId === "string" && typeof p.packageId === "string" && typeof p.source === "string" && isSourceId(p.source),
    )
    // Vlastní argumenty a příkazy ze sady jen s povolením importu (Nastavení → Oprávnění správce)
    .map(({ options, ...p }) => {
      const safe = sanitizeImportedOptions(options && typeof options === "object" ? options : undefined);
      return safe ? { ...p, options: safe } : p;
    });
  const config = parseProfileConfig(data.config);
  return { format: "unibox-bundle", version: 1, name: data.name ?? "", createdAt: data.createdAt ?? "", packages, ...(config ? { config } : {}) };
}

/** Nastavení ze souboru profilu – jen platné položky, jinak undefined. */
function parseProfileConfig(raw: unknown): ProfileConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { pins, autoUpdate } = raw as Record<string, unknown>;
  const config: ProfileConfig = {};
  if (pins && typeof pins === "object") {
    const valid = Object.entries(pins).filter(([key, pin]) => key.includes(":") && isUpdatePin(pin));
    if (valid.length) config.pins = Object.fromEntries(valid);
  }
  if (Array.isArray(autoUpdate)) {
    const keys = autoUpdate.filter((key): key is string => typeof key === "string" && key.includes(":"));
    if (keys.length) config.autoUpdate = keys;
  }
  return config.pins || config.autoUpdate ? config : undefined;
}
