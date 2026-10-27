/**
 * Podrobné parametry instalace: volitelné části instalátoru (PATH, zástupci,
 * kontextová nabídka) a instalace bez restartu. Převádí je na parametry
 * instalátoru, které winget předá přes --custom.
 */
import type { CatalogEntry, InstallerFeature, InstallerFeatureId, InstallerType, InstallOptions, PackageSource } from "@/types";

/** Parametr pro potlačení restartu podle typu instalátoru (null = instalátor to neumí). */
export function noRestartArgs(type: InstallerType | undefined): string | null {
  switch (type) {
    case "inno":
      return "/NORESTART";
    case "msi":
    case "wix":
      return "REBOOT=ReallySuppress";
    case "burn":
      return "/norestart";
    default:
      return null;
  }
}

/** Volitelné části instalátoru – jen u wingetu (parametry jsou pro jeho instalátor). */
export function installerFeatures(entry: CatalogEntry, pkg: PackageSource | undefined): InstallerFeature[] {
  return pkg?.source === "winget" ? (entry.installerFeatures ?? []) : [];
}

/** Zapnuté části instalátoru: uložená volba, jinak výchozí z katalogu. */
export function enabledFeatures(entry: CatalogEntry, options: InstallOptions | undefined): InstallerFeatureId[] {
  return options?.features ?? (entry.installerFeatures ?? []).filter((f) => f.default).map((f) => f.id);
}

/** Umí zdroj instalovat bez restartu? (winget s instalátorem, který na to má parametr) */
export const supportsNoRestart = (pkg: PackageSource | undefined) => pkg?.source === "winget" && !!noRestartArgs(pkg.installerType);

/**
 * Sloučí parametry instalátoru: stejné přepínače typu „/MERGETASKS=a“ a
 * „/MERGETASKS=b“ (Inno Setup) spojí do „/MERGETASKS=a,b“, ostatní ponechá.
 */
function mergeArgs(parts: string[]): string {
  const merged = new Map<string, string[]>();
  const rest: string[] = [];
  for (const token of parts.join(" ").split(/\s+/).filter(Boolean)) {
    const m = token.match(/^(\/(?:MERGETASKS|TASKS|COMPONENTS))=(.+)$/i);
    if (m) merged.set(m[1].toUpperCase(), [...(merged.get(m[1].toUpperCase()) ?? []), m[2]]);
    else rest.push(token);
  }
  return [...rest, ...[...merged].map(([key, values]) => `${key}=${values.join(",")}`)].join(" ");
}

/**
 * Výsledné volby pro správce: volby části instalátoru a „bez restartu“ se
 * převedou na parametry instalátoru (`installerArgs`). Vlastní parametry
 * uživatele (`customArgs`) zůstávají zvlášť – podléhají povolení
 * v Nastavení → Oprávnění správce; společné přepínače se sloučí až v příkazu.
 */
export function resolveInstallOptions(
  entry: CatalogEntry,
  pkg: PackageSource | undefined,
  options: InstallOptions | undefined,
): InstallOptions | undefined {
  const { features: _features, noRestart, ...rest } = options ?? {};
  void _features;
  const extra: string[] = [];

  const enabled = enabledFeatures(entry, options);
  for (const f of installerFeatures(entry, pkg)) {
    const args = enabled.includes(f.id) ? f.args : f.argsOff;
    if (args) extra.push(args);
  }
  // Bez restartu je výchozí (kde to instalátor umí), dokud ho uživatel nevypne
  if (supportsNoRestart(pkg) && noRestart !== false) extra.push(noRestartArgs(pkg!.installerType)!);

  const installerArgs = mergeArgs(extra) || undefined;
  const result: InstallOptions = { ...rest, installerArgs };
  return Object.values(result).some((v) => v !== undefined) ? result : undefined;
}

/** Parametry instalátoru pro příkaz: vlastní (je-li povoleno) a z voleb Uniboxu dohromady. */
export function combinedInstallerArgs(options: InstallOptions | undefined): string | undefined {
  return mergeArgs([options?.customArgs ?? "", options?.installerArgs ?? ""]) || undefined;
}
