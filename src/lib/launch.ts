/**
 * Spouštění nainstalovaných aplikací (jen desktopová aplikace).
 *
 * Backend vrátí položky nabídky Start (`start_apps`: název + AppID, bez
 * odkazů na web, dokumentace a odinstalátorů). Tady se k aplikaci najde ta
 * její – podle AppID shodného s id wingetu, jinak podle názvu z katalogu,
 * názvu nainstalovaného balíčku a id wingetu:
 *  1. stejný název („VLC media player“, „Google Chrome (EXE)“ = „Google Chrome“),
 *  2. položka začíná názvem aplikace („OBS Studio“ → „OBS Studio (64bit)“),
 *  3. název aplikace končí názvem položky („Mozilla Thunderbird“ → „Thunderbird“).
 * Aplikace bez položky v nabídce Start (nástroje příkazové řádky) tlačítko
 * Otevřít nemají.
 */
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import type { CatalogEntry, InstalledPackage } from "@/types";
import { isTauri } from "./tauri";
import { normalize } from "./utils";

export interface StartApp {
  name: string;
  appId: string;
  /** Spouštěcí soubor (cesta malými písmeny), pokud ho backend určil. */
  target?: string;
}

export const START_APPS_KEY = ["start-apps"] as const;

/** Klíč pro porovnání názvů: bez diakritiky, závorek („(64bit)“, „(x64 cs)“), čísel verzí a interpunkce. */
const nameKey = (name: string) =>
  normalize(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(\.\d+)+\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");

interface StartIndex {
  exact: Map<string, StartApp>;
  keyed: [string, StartApp][];
  /** Podle AppID (malými písmeny). */
  ids: Map<string, StartApp>;
}

// Index se počítá jednou pro každý načtený seznam (sdílí ho všechny karty)
const indexes = new WeakMap<StartApp[], StartIndex>();

function indexOf(apps: StartApp[]): StartIndex {
  let index = indexes.get(apps);
  if (!index) {
    const keyed = apps.map((app) => [nameKey(app.name), app] as [string, StartApp]).filter(([key]) => key);
    const exact = new Map<string, StartApp>();
    for (const [key, app] of keyed) if (!exact.has(key)) exact.set(key, app);
    const ids = new Map(apps.map((app) => [app.appId.toLowerCase(), app]));
    index = { exact, keyed, ids };
    indexes.set(apps, index);
  }
  return index;
}

/** Položka nabídky Start pro aplikaci; undefined = nejde spustit. */
export function findStartApp(apps: StartApp[], names: string[]): StartApp | undefined {
  const { exact, keyed } = indexOf(apps);
  const keys = [...new Set(names.map(nameKey).filter((key) => key.length >= 2))];
  for (const key of keys) {
    const hit = exact.get(key);
    if (hit) return hit;
  }
  // Nejkratší položka, která začíná názvem aplikace / kterou název aplikace končí
  const shortest = (matches: [string, StartApp][]) => matches.sort((a, b) => a[0].length - b[0].length)[0]?.[1];
  for (const key of keys.filter((k) => k.length >= 4)) {
    const hit = shortest(keyed.filter(([start]) => start.startsWith(key)));
    if (hit) return hit;
  }
  for (const key of keys) {
    const hit = shortest(keyed.filter(([start]) => start.length >= 4 && key.endsWith(start)));
    if (hit) return hit;
  }
  return undefined;
}

/** Položky nabídky Start (sdílená cache; obnoví se po instalaci / odinstalaci). */
export function useStartApps() {
  return useQuery({
    queryKey: START_APPS_KEY,
    queryFn: () => invoke<StartApp[]>("start_apps"),
    enabled: isTauri(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Položka nabídky Start pro nainstalovaný balíček. Nejdřív podle AppID –
 * některé aplikace ho mají shodné s id wingetu (EA app: položka „EA“,
 * AppID „ElectronicArts.EADesktop“) – u programu nalezeného jen na disku
 * zástupce do jeho složky (podle názvu, jinak ten s nejkratším názvem) –
 * jinak podle názvů.
 */
export function startAppFor(apps: StartApp[], name: string, installed: InstalledPackage): StartApp | undefined {
  const byId = indexOf(apps).ids.get(installed.packageId.toLowerCase());
  if (byId) return byId;
  if (installed.diskLocation) {
    const inside = `${installed.diskLocation.toLowerCase().replace(/\\+$/, "")}\\`;
    const own = apps.filter((app) => app.target?.startsWith(inside));
    if (own.length) return findStartApp(own, [name, installed.name]) ?? [...own].sort((a, b) => a.name.length - b.name.length)[0];
  }
  const wingetTail = installed.source === "winget" ? installed.packageId.split(".").slice(1).join(" ") : "";
  return findStartApp(apps, [name, installed.name, wingetTail]);
}

/** Jak spustit nainstalovanou aplikaci (jen v desktopové aplikaci a jen nainstalovanou). */
export function useLaunchTarget(entry: CatalogEntry, installed: InstalledPackage | undefined): StartApp | undefined {
  const { data } = useStartApps();
  if (!data || !installed) return undefined;
  return startAppFor(data, entry.name, installed);
}

export const launchApp = (app: StartApp) => invoke<void>("launch_app", { appId: app.appId });
