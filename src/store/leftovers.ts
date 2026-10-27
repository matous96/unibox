/**
 * Zbytky po odinstalaci (src-tauri/src/leftovers.rs). Po úspěšné odinstalaci
 * se hledají složky aplikace v AppData; s pokročilou odinstalací (Nastavení)
 * i v Program Files, ProgramData, zástupcích a v registru Windows. Byla-li
 * instalace sledovaná (tracker.rs), přidají se všechny zaznamenané položky,
 * které ještě existují – nezávisle na pokročilé odinstalaci.
 *  - Nalezené zbytky ukáže LeftoversDialog se zaškrtávacím seznamem,
 *  - s automatickým úklidem (jen spolu s pokročilou odinstalací) se smažou
 *    rovnou a přijde jen nenápadné oznámení.
 * Soubory a složky jdou do Koše, klíče registru se před smazáním zálohují.
 */
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import i18n from "@/i18n";
import { isTauri } from "@/lib/tauri";
import { notifyEvent } from "@/services/notify";
import { traceKey } from "@/services/tracker";
import { useSecurity } from "./security";
import { useSettings } from "./settings";

export type LeftoverKind = "folder" | "file" | "registry" | "value";

export interface Leftover {
  /** Cesta, u registru klíč („HKCU\Software\…“), u hodnoty „klíč Run|název“. */
  path: string;
  kind: LeftoverKind;
  size: number;
  /** Počet souborů, u registru počet hodnot. */
  files: number;
  /** Smazání vyžaduje práva správce (Program Files, ProgramData, HKLM). */
  admin: boolean;
}

export interface Removal {
  removed: string[];
  failed: string[];
  /** Vyžaduje práva správce a nesmazalo se (povýšení zakázané nebo UAC odmítnut). */
  needsAdmin: string[];
  /** Složka se zálohou smazaných klíčů registru. */
  backup: string | null;
}

interface Scan {
  items: Leftover[];
  /** Aplikace je pořád nainstalovaná (jiná kopie, nebo odinstalátor ještě nedoběhl). */
  stillInstalled: boolean;
  /** Kolik položek přidal záznam instalace. */
  traced: number;
}

/**
 * Kdy hledat (ms od konce odinstalace): odinstalátory NSIS / MSI a Squirrel
 * dokončují úklid (záznam v registru, zástupce, klíče) až chvíli po návratu
 * správce – první hledání proto počká a dokud záznam trvá, nenabídne nic
 * (aplikace by vypadala nainstalovaná) a zkusí to znovu.
 */
const SCAN_AT = [2500, 6000, 12000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LeftoversState {
  /**
   * Nález čekající na rozhodnutí uživatele; `deep` = pokročilá odinstalace,
   * `traced` = počet položek ze záznamu instalace.
   */
  pending: { appName: string; items: Leftover[]; deep: boolean; traced: number } | null;
  /** Najde zbytky po odinstalované aplikaci a otevře dialog, nebo je rovnou smaže. */
  check: (appName: string, packageId: string, source: string) => Promise<void>;
  /** Smaže vybrané zbytky (z dialogu). */
  remove: (paths: string[]) => Promise<Removal>;
  dismiss: () => void;
}

/** Smazání zbytků – s oprávněním správce (jedno UAC), pokud ho Nastavení nezakazuje. */
const removeItems = (appName: string, paths: string[]) =>
  invoke<Removal>("remove_leftovers", { paths, appName, elevate: !useSecurity.getState().elevationProhibited });

/** Automatický úklid: smaže vše nalezené a ohlásí jen výsledek. */
async function autoClean(appName: string, items: Leftover[]) {
  try {
    const result = await removeItems(appName, items.map((i) => i.path));
    const left = result.failed.length + result.needsAdmin.length;
    const message = [
      i18n.t("leftovers.autoRemoved", { count: result.removed.length }),
      left ? i18n.t("leftovers.autoLeft", { count: left }) : "",
    ]
      .filter(Boolean)
      .join(" ");
    notifyEvent({ type: "info", tone: left && !result.removed.length ? "error" : "success", title: appName, message, record: true });
  } catch (error) {
    notifyEvent({ type: "info", tone: "error", title: appName, message: i18n.t("leftovers.failed"), record: true });
    console.warn("Automatický úklid zbytků selhal:", error);
  }
}

export const useLeftovers = create<LeftoversState>()((set, get) => ({
  pending: null,

  check: async (appName, packageId, source) => {
    if (!isTauri()) return;
    const { advancedUninstall, autoCleanup } = useSettings.getState();
    try {
      let scan: Scan = { items: [], stillInstalled: true, traced: 0 };
      let waited = 0;
      for (const at of SCAN_AT) {
        await sleep(at - waited);
        waited = at;
        scan = await invoke<Scan>("leftover_scan", { name: appName, packageId, deep: advancedUninstall, traceKey: traceKey(source, packageId) });
        if (!scan.stillInstalled) break;
      }
      const { items, traced } = scan;
      if (!items.length) return;
      if (advancedUninstall && autoCleanup) await autoClean(appName, items);
      else set({ pending: { appName, items, deep: advancedUninstall || traced > 0, traced } });
    } catch (error) {
      console.warn("Hledání zbytků po odinstalaci selhalo:", error);
    }
  },

  remove: async (paths) => {
    const appName = get().pending?.appName ?? "";
    try {
      return await removeItems(appName, paths);
    } finally {
      set({ pending: null });
    }
  },

  dismiss: () => set({ pending: null }),
}));
