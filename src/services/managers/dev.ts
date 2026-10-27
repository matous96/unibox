/**
 * Správci pro vývojáře v desktopové aplikaci – Rust backend (src-tauri/src/dev.rs):
 * npm, Bun, pip, Cargo, vcpkg, .NET Tool, PowerShell 7 (PSResourceGet)
 * a Windows PowerShell 5.1 (PowerShellGet).
 *
 * Nainstalované balíčky vypíše samotný nástroj, hledání jde přes veřejná API
 * registrů (npm, crates.io, NuGet, PowerShell Gallery; u PyPI přesná shoda).
 * Chybějící nástroj nainstaluje winget (Node.js, Bun, Python, Rustup, .NET SDK,
 * PowerShell 7). Používají se jen v režimu Vývojář (store/sourceLock.ts).
 */
import { invoke } from "@tauri-apps/api/core";
import type { InstalledPackage, ManagerStatus, RepoSearchResult, SourceId } from "@/types";
import { managerErrorMessage, startBackendOperation } from "./backend";
import { getSource } from "./sources";
import type { OperationRequest, PackageManager } from "./types";

interface BackendInstalled {
  packageId: string;
  name: string;
  installedVersion: string;
  availableVersion: string | null;
}

export function devManager(id: SourceId): PackageManager {
  const label = getSource(id).label;
  return {
    id,

    getStatus: () => invoke<ManagerStatus>("dev_status", { source: id }),

    setup: () => invoke<void>("dev_setup", { source: id }),

    async getInstalled(): Promise<InstalledPackage[]> {
      const items = await invoke<BackendInstalled[]>("dev_installed", { source: id });
      return items.map((p) => ({ ...p, source: id, origin: id }));
    },

    async search(query, signal): Promise<RepoSearchResult[]> {
      if (query.trim().length < 2) return [];
      const items = await invoke<Omit<RepoSearchResult, "source">[]>("dev_search", { source: id, query });
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return items.map((p) => ({ ...p, source: id }));
    },

    getVersions: (packageId) => invoke<string[]>("dev_versions", { source: id, packageId }),

    // Mezipaměť vývojářských správců maže příkaz v protokolu (cacheCleanCommand)
    getCache: async () => null,

    clearCache: async () => undefined,

    startOperation: (request: OperationRequest, onProgress) =>
      startBackendOperation(id, "dev_operation", request, onProgress, managerErrorMessage(label), { source: id }),
  };
}
