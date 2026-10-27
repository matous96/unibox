/**
 * Nainstalované balíčky spárované s profily z katalogu, dostupné aktualizace
 * a „Aktualizovat vše“. Sdílí je přehled na domovské stránce i stránka Nainstalované.
 */
import { useMemo } from "react";
import { updateOptionsFor } from "@/store/installOptions";
import { useBusyAppIds, useJobs } from "@/store/jobs";
import type { CatalogEntry, InstalledPackage, InstallOrigin, SourceId } from "@/types";
import { fallbackEntry, isListedInstalled, useInstalled, useInstalledEntries } from "./usePackages";

export interface InstalledItem {
  pkg: InstalledPackage;
  entry: CatalogEntry;
}

/** Původ, u kterého aplikaci Unibox nespravuje (hry ze Steamu, programy mimo správce). */
export const isUnmanagedOrigin = (origin: InstallOrigin) => origin === "steam" || origin === "local";

export function useInstalledItems() {
  const query = useInstalled();
  // Profil z katalogu podle id balíčku, jinak podle názvu (programy, které winget vidí jen v registru)
  const links = useInstalledEntries();
  const items = useMemo<InstalledItem[]>(
    () =>
      (query.data ?? [])
        .filter((p) => isListedInstalled(p, links))
        .map((p) => ({
          pkg: p,
          entry: links.get(p) ?? fallbackEntry(p.source, p.packageId, p.name, p.installedVersion),
        })),
    [query.data, links],
  );
  return { ...query, items };
}

/** Dostupné aktualizace a jejich hromadné spuštění (volitelně jen od jednoho správce). */
export function useUpdates(source?: SourceId) {
  const { items, isLoading } = useInstalledItems();
  const busy = useBusyAppIds();
  const enqueue = useJobs((s) => s.enqueue);
  const updatable = useMemo(
    () => items.filter((i) => i.pkg.availableVersion && (!source || i.pkg.source === source)),
    [items, source],
  );
  // Aktualizace, které ještě nečekají ve frontě
  const pending = updatable.filter((i) => !busy.has(i.entry.id));
  const running = updatable.length - pending.length;

  /** Zařadí do fronty všechny aktualizace, každou přes správce, kterým byla aplikace nainstalována. */
  const updateAll = () => {
    for (const { pkg, entry } of pending) {
      enqueue({
        appId: entry.id,
        appName: entry.name,
        source: pkg.source,
        packageId: pkg.packageId,
        kind: "update",
        options: updateOptionsFor(entry.id, pkg, entry),
      });
    }
  };

  return { updatable, pending: pending.length, running, updateAll, isLoading };
}
