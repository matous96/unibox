/**
 * Nainstalované balíčky spárované s profily z katalogu, dostupné aktualizace
 * a „Aktualizovat vše“. Sdílí je přehled na domovské stránce i stránka Nainstalované.
 */
import { useMemo } from "react";
import { updateOptionsFor } from "@/store/installOptions";
import { useBusyAppIds, useJobs } from "@/store/jobs";
import { useUpdateHolds, versionKey } from "@/store/updateHolds";
import type { CatalogEntry, InstalledPackage, InstallOrigin, SourceId } from "@/types";
import { fallbackEntry, isListedInstalled, useInstalled, useInstalledEntries } from "./usePackages";

export interface InstalledItem {
  pkg: InstalledPackage;
  entry: CatalogEntry;
}

/** Původ, u kterého aplikaci Unibox nespravuje (hry ze Steamu, programy mimo správce). */
export const isUnmanagedOrigin = (origin: InstallOrigin) => origin === "steam" || origin === "ea" || origin === "local";

export function useInstalledItems() {
  const query = useInstalled();
  // Profil z katalogu podle id balíčku, jinak podle názvu (programy, které winget vidí jen v registru)
  const links = useInstalledEntries();
  const items = useMemo<InstalledItem[]>(() => {
    const seen = new Set<string>();
    return (query.data ?? [])
      .filter((p) => isListedInstalled(p, links))
      .map((p) => {
        const linked = links.get(p);
        if (linked && !seen.has(linked.id)) {
          seen.add(linked.id);
          return { pkg: p, entry: linked };
        }
        const own = fallbackEntry(p.source, p.packageId, p.name, p.installedVersion);
        if (!linked) return { pkg: p, entry: own };
        // Další instalace téže aplikace jiným správcem (Git přes winget i jako závislost Scoopu):
        // profil z katalogu, ale vlastní id „zdroj:balíček“ jako v useInstalledIndex – jinak by
        // obě karty měly stejný klíč a ukazovaly první instalaci a fronta úloh by druhou přeskočila
        const sources = linked.sources.filter((s) => s.source === p.source);
        return { pkg: p, entry: { ...linked, id: own.id, sources: sources.length ? sources : linked.sources } };
      });
  }, [query.data, links]);
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

/**
 * Aktualizace, které automatické aktualizace odložily, protože potřebují práva správce
 * (na pozadí bez dialogu UAC) – „Čeká na potvrzení“ v Dostupných aktualizacích.
 */
export function useAdminPendingUpdates() {
  const { updatable } = useUpdates();
  const held = useUpdateHolds((s) => s.needsAdmin);
  return useMemo(() => updatable.filter(({ pkg }) => held[versionKey(pkg, pkg.availableVersion!)]), [updatable, held]);
}
