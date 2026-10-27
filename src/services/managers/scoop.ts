/**
 * Scoop v desktopové aplikaci – Rust backend (src-tauri/src/scoop.rs).
 *
 * Nainstalované aplikace čte backend přímo ze složek Scoopu (i s novější
 * verzí z bucketu), hledání prochází manifesty v přidaných bucketech.
 * Chybějící Scoop jde nainstalovat oficiálním instalátorem (get.scoop.sh,
 * bez práv správce). Unibox přes Scoop instaluje, aktualizuje, odinstaluje
 * a stahuje – i jako záložní zdroj, když odkaz ve WinGetu nefunguje.
 */
import { invoke } from "@tauri-apps/api/core";
import type { InstalledPackage, ManagerStatus, RepoSearchResult } from "@/types";
import { managerErrorMessage, startBackendOperation } from "./backend";
import type { PackageManager } from "./types";

/** Nainstalovaná aplikace, jak ji vrací backend („extras/aimp“). */
interface BackendInstalled {
  packageId: string;
  name: string;
  installedVersion: string;
  availableVersion: string | null;
}

export const scoopManager: PackageManager = {
  id: "scoop",

  getStatus: () => invoke<ManagerStatus>("scoop_status"),

  setup: () => invoke<void>("scoop_setup"),

  async getInstalled(): Promise<InstalledPackage[]> {
    const items = await invoke<BackendInstalled[]>("scoop_installed");
    return items.map((p) => ({ ...p, source: "scoop", origin: "scoop" }));
  },

  async search(query, signal): Promise<RepoSearchResult[]> {
    if (!query.trim()) return [];
    const items = await invoke<Omit<RepoSearchResult, "source">[]>("scoop_search", { query });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return items.map((p) => ({ ...p, source: "scoop" }));
  },

  getVersions: (packageId) => invoke<string[]>("scoop_versions", { packageId }),

  getCache: async () => null,

  clearCache: async () => undefined,

  startOperation: (request, onProgress) =>
    startBackendOperation("scoop", "scoop_operation", request, onProgress, managerErrorMessage("Scoop")),
};
