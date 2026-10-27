/**
 * Obnova stavu po dokončené operaci (instalace, aktualizace, odinstalace).
 *
 * 1. Hned (optimisticky) se upraví seznam nainstalovaných v cache – karta
 *    i detail se přepnou okamžitě, bez čekání na správce (výpis wingetu
 *    trvá kolem 2 s).
 * 2. Pak se seznam nainstalovaných a položky nabídky Start (tlačítko Otevřít)
 *    několikrát po sobě ověří u správce: odinstalátory NSIS / MSI a instalátory
 *    typu Squirrel (Discord…) dokončují práci až po návratu wingetu – záznam
 *    v registru zmizí, resp. zástupce v nabídce Start vznikne o pár sekund
 *    později. Jedno obnovení hned po operaci by to nezachytilo.
 */
import { queryClient, queryKeys } from "@/app/queryClient";
import { START_APPS_KEY } from "@/lib/launch";
import type { CatalogEntry, InstalledPackage, Job } from "@/types";
import type { LoadedCatalog } from "@/services/catalog";
import { useUpdateHolds, versionKey } from "./updateHolds";

/** Kdy znovu ověřit stav u správce (ms od konce operace). */
const CHECKS = [0, 2500, 6000, 12000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const samePackage = (p: InstalledPackage, job: Job) => p.source === job.source && p.packageId === job.packageId;

/** Nejnovější verze aplikace z katalogu (pro okamžité zobrazení „Máte …“ po instalaci). */
function catalogVersion(job: Job): string {
  const catalog = queryClient.getQueryData<LoadedCatalog>(queryKeys.catalog)?.catalog.packages ?? [];
  const entry: CatalogEntry | undefined = catalog.find((p) => p.id === job.appId);
  return job.version ?? entry?.sources.find((s) => s.source === job.source)?.version ?? entry?.latestVersion ?? "";
}

/** Okamžitá úprava seznamu nainstalovaných podle výsledku operace. */
function applyOptimistic(job: Job) {
  const update = (list: InstalledPackage[] | undefined): InstalledPackage[] | undefined => {
    if (!list) return list;
    const existing = list.find((p) => samePackage(p, job));
    switch (job.kind) {
      case "uninstall":
        return list.filter((p) => !samePackage(p, job));
      case "update":
        return list.map((p) =>
          samePackage(p, job) ? { ...p, installedVersion: p.availableVersion ?? p.installedVersion, availableVersion: null } : p,
        );
      case "install":
        if (existing) return list.map((p) => (samePackage(p, job) ? { ...p, installedVersion: catalogVersion(job), availableVersion: null } : p));
        return [
          ...list,
          {
            source: job.source,
            packageId: job.packageId,
            name: job.appName,
            installedVersion: catalogVersion(job),
            availableVersion: null,
            origin: job.source,
          },
        ];
      default:
        return list;
    }
  };
  for (const [key, data] of queryClient.getQueriesData<InstalledPackage[]>({ queryKey: queryKeys.installed })) {
    queryClient.setQueryData(key, update(data));
  }
}

/** Odpovídá skutečný seznam od správce výsledku operace? */
function settled(job: Job): boolean {
  const lists = queryClient.getQueriesData<InstalledPackage[]>({ queryKey: queryKeys.installed }).map(([, d]) => d ?? []);
  const found = lists.some((list) => list.some((p) => samePackage(p, job)));
  return job.kind === "uninstall" ? !found : found;
}

/** Nabízená verze balíčku podle posledního výpisu od správce. */
function offeredVersion(job: Job): string | null {
  const lists = queryClient.getQueriesData<InstalledPackage[]>({ queryKey: queryKeys.installed }).map(([, d]) => d ?? []);
  for (const list of lists) {
    const pkg = list.find((p) => samePackage(p, job));
    if (pkg) return pkg.availableVersion;
  }
  return null;
}

/**
 * Aktualizace proběhla, ale správce po ní nabízí pořád stejnou verzi (winget
 * u balíčků, jejichž instalátor verzi v registru nezmění) – započítá se;
 * po několika pokusech ji pravidla aktualizací přestanou nabízet.
 */
async function verifyUpdate(job: Job, target: string) {
  await sleep(10_000);
  await queryClient.refetchQueries({ queryKey: queryKeys.installed }, { cancelRefetch: false });
  if (offeredVersion(job) === target) useUpdateHolds.getState().recordStuck(versionKey(job, target));
}

/** Obnoví stav po úspěšné operaci (běží na pozadí, fronta na něj nečeká). */
export async function refreshAfterOperation(job: Job, success: boolean) {
  if (job.kind === "download") return;
  // Rozběhnuté načítání se starým stavem by optimistickou úpravu přepsalo
  await queryClient.cancelQueries({ queryKey: queryKeys.installed });
  // Verze, na kterou se aktualizovalo (před optimistickou úpravou)
  const target = success && job.kind === "update" ? offeredVersion(job) : null;
  if (success) applyOptimistic(job);

  let waited = 0;
  for (const at of CHECKS) {
    await sleep(at - waited);
    waited = at;
    // Probíhající načítání se využije, nezahazuje se
    await Promise.all([
      queryClient.refetchQueries({ queryKey: queryKeys.installed }, { cancelRefetch: false }),
      queryClient.refetchQueries({ queryKey: START_APPS_KEY }, { cancelRefetch: false }),
    ]);
    // Neúspěch = jen jedno ověření; u instalace se položky nabídky Start
    // ověřují celou dobu (zástupce může vzniknout až po zápisu do registru)
    if (!success || (job.kind !== "install" && settled(job))) break;
  }
  if (target) await verifyUpdate(job, target);
}
