/**
 * Uložené volby instalace pro jednotlivé aplikace (jako v UniGetUI):
 * zvolený zdroj, verze a volby jako „jako správce“ nebo „interaktivně“.
 * Běžné tlačítko Instalovat je pak použije automaticky.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { resolveInstallOptions } from "@/lib/installArgs";
import { isSourceId } from "@/services/managers/sources";
import type { CatalogEntry, InstalledPackage, InstallOptions, PackageSource, SourceId } from "@/types";

export interface SavedInstallOptions extends InstallOptions {
  /** Zdroj, ze kterého instalovat; vynecháno = podle priority v nastavení. */
  source?: SourceId;
  /** Verze; vynecháno = nejnovější. */
  version?: string;
  /** Varianta balíčku wingetu (jazyk, typ instalátoru) – id balíčku; vynecháno = základní. */
  variant?: string;
}

interface InstallOptionsState {
  byApp: Record<string, SavedInstallOptions>;
  save: (appId: string, options: SavedInstallOptions) => void;
  reset: (appId: string) => void;
}

/**
 * Odstraní prázdné hodnoty, ať se ukládá jen to, co se liší od výchozího chování.
 * `false` a prázdný seznam se ukládají – vypínají výchozí volby (bez restartu, PATH…).
 */
function compact(options: SavedInstallOptions): SavedInstallOptions {
  const clean = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined && v !== ""));
  // Vypnuté „jako správce“ / „interaktivně“ / „přeskočit součet“ jsou výchozí stav – neukládat
  for (const key of ["asAdmin", "interactive", "skipHash"] as const) if (clean[key] === false) delete clean[key];
  return clean;
}

export const useInstallOptions = create<InstallOptionsState>()(
  persist(
    (set, get) => ({
      byApp: {},
      save: (appId, options) => {
        const clean = compact(options);
        const byApp = { ...get().byApp };
        if (Object.keys(clean).length) byApp[appId] = clean;
        else delete byApp[appId];
        set({ byApp });
      },
      reset: (appId) => {
        const byApp = { ...get().byApp };
        delete byApp[appId];
        set({ byApp });
      },
    }),
    {
      name: "unibox-install-options",
      // Uložený zdroj, který HubGet už nepodporuje, zahodit
      merge: (persisted, current) => {
        const saved = (persisted as Partial<InstallOptionsState> | undefined)?.byApp ?? {};
        const byApp = Object.fromEntries(
          Object.entries(saved).map(([id, o]) => [id, o.source && !isSourceId(o.source) ? { ...o, source: undefined } : o]),
        );
        return { ...current, byApp };
      },
    },
  ),
);

/** Volby instalace bez zdroje, verze a varianty (to, co se předává správci). */
export function installFlags(saved: SavedInstallOptions | undefined): InstallOptions | undefined {
  if (!saved) return undefined;
  const { source: _source, version: _version, variant: _variant, ...flags } = saved;
  void _source;
  void _version;
  void _variant;
  return Object.keys(flags).length ? flags : undefined;
}

/**
 * Volby pro aktualizaci (jako v UniGetUI): uložené volby aplikace platí i pro
 * aktualizace – jako správce, interaktivně, kontrolní součet, architektura,
 * rozsah, složka, parametry instalátoru (pro aktualizace vlastní, jsou-li
 * zadané), příkazy před / po a odinstalace předchozí verze. Volby uložené
 * pro jiný zdroj se nepoužijí.
 */
export function updateOptionsFor(
  appId: string,
  installed: Pick<InstalledPackage, "source" | "packageId">,
  entry?: CatalogEntry,
): InstallOptions | undefined {
  const saved = useInstallOptions.getState().byApp[appId];
  if (!saved || (saved.source && saved.source !== installed.source)) return undefined;
  const { updateArgs, ...flags } = installFlags(saved) ?? {};
  const options: InstallOptions = updateArgs ? { ...flags, customArgs: updateArgs } : flags;
  // Části instalátoru (PATH, zástupci) a „bez restartu“ se převedou na parametry instalátoru (jen s katalogem)
  if (entry) return resolveInstallOptions(entry, entry.sources.find((s) => s.source === installed.source), options);
  const { features: _features, noRestart: _noRestart, ...rest } = options;
  void _features;
  void _noRestart;
  return Object.keys(rest).length ? rest : undefined;
}

/** Id balíčku k instalaci: uložená varianta (jen u wingetu, je-li v katalogu), jinak základní. */
export function packageIdFor(pkg: PackageSource, saved: SavedInstallOptions | undefined): string {
  const variant = saved?.variant;
  return variant && pkg.source === "winget" && pkg.variants?.some((v) => v.packageId === variant) ? variant : pkg.packageId;
}
