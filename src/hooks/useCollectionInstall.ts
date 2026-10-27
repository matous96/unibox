/**
 * „Instalovat vše“ pro kolekci aplikací – sdílí ho karty kolekcí na domovské
 * stránce i detail kolekce. Zařadí do fronty jen aplikace, které ještě nejsou
 * nainstalované ani ve frontě a jde je nainstalovat ze zapnutého správce.
 */
import { pickSource, useInstalledIndex } from "@/hooks/usePackages";
import { useBusyAppIds, useJobs } from "@/store/jobs";
import { useSourceScope } from "@/store/sourceLock";
import type { CatalogEntry } from "@/types";

export function useCollectionInstall(entries: CatalogEntry[]) {
  // Při zamčeném zdroji jen aplikace z něj
  const { enabled, preferred } = useSourceScope();
  const installedIndex = useInstalledIndex();
  const busy = useBusyAppIds();
  const enqueue = useJobs((s) => s.enqueue);

  const pending = entries.filter((e) => !installedIndex.has(e.id) && !busy.has(e.id) && pickSource(e, enabled, preferred));

  const installAll = () => {
    for (const e of pending) {
      const source = pickSource(e, enabled, preferred)!;
      enqueue({ appId: e.id, appName: e.name, source: source.source, packageId: source.packageId, kind: "install" });
    }
  };

  return { pending, installAll };
}
