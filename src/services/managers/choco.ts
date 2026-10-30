/**
 * Chocolatey v desktopové aplikaci – Rust backend (src-tauri/src/choco.rs).
 *
 * Nainstalované balíčky čte backend z manifestů ve složce Chocolatey (bez
 * závislostí); balíčky s instalátorem vidí i winget – o zdvojení rozhoduje
 * getAllInstalled. Dostupné aktualizace (`choco outdated`) znamenají dotaz na
 * repozitář, který trvá i desítky sekund – seznam nainstalovaných proto vezme
 * poslední známý výsledek a nový zjistí na pozadí (pak ho doplní do seznamu).
 * Hledání a verze z repozitáře Chocolatey Community (choco search). Chybějící
 * Chocolatey jde nainstalovat oficiálním skriptem (práva správce). HubGet přes
 * něj instaluje, aktualizuje a odinstaluje – i jako záložní zdroj, když odkaz
 * na instalátor ve WinGetu nefunguje.
 */
import { invoke } from "@tauri-apps/api/core";
import { queryClient, queryKeys } from "@/app/queryClient";
import type { InstalledPackage, ManagerStatus, RepoSearchResult } from "@/types";
import { managerErrorMessage, startBackendOperation } from "./backend";
import type { PackageManager } from "./types";

/** Nainstalovaný balíček, jak ho vrací backend (název z manifestu). */
interface BackendInstalled {
  packageId: string;
  name: string;
  installedVersion: string;
  /** Balíček spouští instalátor – program je i v registru Windows (vidí ho winget). */
  installer: boolean;
}

interface BackendOutdated {
  packageId: string;
  installedVersion: string;
  availableVersion: string;
}

/** Poslední přehled dostupných aktualizací: id (malými písmeny) → [nainstalovaná, dostupná verze]. */
interface Outdated {
  at: number;
  items: Record<string, [string, string]>;
}

const OUTDATED_KEY = "unibox-choco-outdated";
/** Jak dlouho přehled stačí – pak se při dalším načtení zjistí znovu. */
const OUTDATED_TTL = 15 * 60_000;

function loadOutdated(): Outdated | null {
  try {
    const saved = JSON.parse(localStorage.getItem(OUTDATED_KEY) ?? "null") as Outdated | null;
    return saved && typeof saved.at === "number" && saved.items ? saved : null;
  } catch {
    return null;
  }
}

let outdated = loadOutdated();
let running: Promise<void> | null = null;

/** Dostupná verze podle přehledu – jen když se nainstalovaná verze mezitím nezměnila. */
function availableFor(packageId: string, installedVersion: string): string | null {
  const known = outdated?.items[packageId.toLowerCase()];
  return known && known[0] === installedVersion ? known[1] : null;
}

/**
 * Zjistí dostupné aktualizace znovu (`choco outdated`) a doplní je do seznamu
 * nainstalovaných. Kontrola aktualizací na pozadí na výsledek počká.
 */
export function refreshChocoOutdated(): Promise<void> {
  running ??= invoke<BackendOutdated[]>("choco_outdated")
    .then((items) => {
      outdated = {
        at: Date.now(),
        items: Object.fromEntries(items.map((i) => [i.packageId.toLowerCase(), [i.installedVersion, i.availableVersion]])),
      };
      try {
        localStorage.setItem(OUTDATED_KEY, JSON.stringify(outdated));
      } catch {
        /* úložiště nedostupné – přehled platí jen do zavření */
      }
      // Seznam nainstalovaných už načtený – doplnit dostupné verze bez nového výpisu u všech správců
      for (const [key, list] of queryClient.getQueriesData<InstalledPackage[]>({ queryKey: queryKeys.installed })) {
        if (!list) continue;
        queryClient.setQueryData(
          key,
          list.map((p) => (p.source === "chocolatey" ? { ...p, availableVersion: availableFor(p.packageId, p.installedVersion) } : p)),
        );
      }
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export const chocoManager: PackageManager = {
  id: "chocolatey",

  getStatus: () => invoke<ManagerStatus>("choco_status"),

  setup: () => invoke<void>("choco_setup"),

  async getInstalled(): Promise<InstalledPackage[]> {
    const items = await invoke<BackendInstalled[]>("choco_installed");
    // Přehled aktualizací starý nebo žádný → zjistit na pozadí (seznam na něj nečeká)
    if (items.length && (!outdated || Date.now() - outdated.at > OUTDATED_TTL)) void refreshChocoOutdated().catch(() => undefined);
    return items.map(({ installer, ...p }) => ({
      ...p,
      availableVersion: availableFor(p.packageId, p.installedVersion),
      source: "chocolatey",
      origin: "chocolatey",
      installer,
    }));
  },

  async search(query, signal): Promise<RepoSearchResult[]> {
    if (!query.trim()) return [];
    const items = await invoke<Omit<RepoSearchResult, "source">[]>("choco_search", { query });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return items.map((p) => ({ ...p, source: "chocolatey" }));
  },

  getVersions: (packageId) => invoke<string[]>("choco_versions", { packageId }),

  getCache: async () => null,

  clearCache: async () => undefined,

  startOperation: (request, onProgress) =>
    startBackendOperation("chocolatey", "choco_operation", request, onProgress, managerErrorMessage("Chocolatey")),
};
