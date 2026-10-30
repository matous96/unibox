import type { Arch, CatalogEntry, PackageSource } from "@/types";
import { getSystemInfo } from "./tauri";

/** Pořadí a popisky architektur. */
export const ARCHES: Arch[] = ["x64", "arm64", "x86"];
export const ARCH_LABEL: Record<Arch, string> = { x64: "x64", arm64: "ARM64", x86: "x86" };

/**
 * Zjistí architekturu tohoto počítače. V desktopové aplikaci ji dodá backend
 * (skutečná architektura Windows, i když aplikace běží v emulaci), v prohlížeči
 * Client Hints (navigator.userAgentData). Vrací null, pokud ji nelze zjistit.
 */
export async function getDeviceArch(): Promise<Arch | null> {
  const system = await getSystemInfo();
  if (system) return system.arch;

  type UAData = { getHighEntropyValues(hints: string[]): Promise<{ architecture?: string; bitness?: string }> };
  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  if (!uaData) return null;
  try {
    const { architecture, bitness } = await uaData.getHighEntropyValues(["architecture", "bitness"]);
    if (architecture === "arm") return bitness === "64" ? "arm64" : null;
    if (architecture === "x86") return bitness === "64" ? "x64" : "x86";
    return null;
  } catch {
    return null;
  }
}

/** Krátký text „x64 · ARM64“ pro štítky (banner). */
export function archSummary(architectures: Arch[]): string {
  return ARCHES.filter((a) => architectures.includes(a))
    .map((a) => ARCH_LABEL[a])
    .join(" · ");
}

/** Sjednocení architektur ze všech zdrojů aplikace. */
export function allArchitectures(sources: { architectures?: Arch[] }[]): Arch[] {
  return ARCHES.filter((a) => sources.some((s) => s.architectures?.includes(a)));
}

/** Architektura v příponě id balíčku („Discord.Discord.arm64“, „python.x86“, „vvvv.x64“). */
const ARCH_SUFFIX = /[._-](arm64|aarch64|x64|amd64|x86|i386|i686)$/i;
const SUFFIX_ARCH: Record<string, Arch> = { arm64: "arm64", aarch64: "arm64", x64: "x64", amd64: "x64", x86: "x86", i386: "x86", i686: "x86" };

type ArchSource = Pick<PackageSource, "source" | "packageId" | "architectures">;

/** Rodiny balíčků s verzemi pro jiné procesory: „winget:discord.discord.ptb“ → {arm64, x86}. */
export type ArchFamilies = Map<string, Set<Arch>>;
const familyKey = (source: string, packageId: string) => `${source}:${packageId.toLowerCase()}`;
const familyCache = new WeakMap<object, ArchFamilies>();
/** Architektury podle pole zdrojů aplikace (záznamy katalogu se nemění). */
const archCache = new WeakMap<object, Arch[]>();

/** Rodiny podle přípon id v katalogu (spočítá se jednou pro načtený katalog). */
export function archFamilies(packages: CatalogEntry[]): ArchFamilies {
  const cached = familyCache.get(packages);
  if (cached) return cached;
  const families: ArchFamilies = new Map();
  for (const p of packages) {
    for (const s of p.sources) {
      const match = ARCH_SUFFIX.exec(s.packageId);
      if (!match) continue;
      const key = familyKey(s.source, s.packageId.slice(0, match.index));
      families.set(key, (families.get(key) ?? new Set()).add(SUFFIX_ARCH[match[1].toLowerCase()]));
    }
  }
  familyCache.set(packages, families);
  return families;
}

/**
 * Architektury aplikace: z údajů katalogu, a kde chybí (u většiny balíčků), z přípony id –
 * WinGet vede verze pro jiné procesory jako samostatné balíčky („Discord.Discord.arm64“).
 * Balíček bez přípony, který má sourozence jen pro ARM64 či x86, je verze pro x64.
 * Prázdný výsledek = neznámo (aplikace bez přípony bývají pro x64 nebo nezávislé na procesoru).
 */
export function packageArchitectures(sources: ArchSource[], families?: ArchFamilies): Arch[] {
  // S rodinami z katalogu je výsledek pro dané zdroje stálý – přepnutí filtru pak katalog nepočítá znovu
  const cached = families && archCache.get(sources);
  if (cached) return cached;
  const known = allArchitectures(sources);
  const result = known.length ? known : architecturesFromIds(sources, families);
  if (families) archCache.set(sources, result);
  return result;
}

/** Architektury aplikace jen podle id balíčků (přípona, sourozenci pro jiné procesory). */
function architecturesFromIds(sources: ArchSource[], families?: ArchFamilies): Arch[] {
  const found = new Set<Arch>();
  for (const s of sources) {
    const suffix = ARCH_SUFFIX.exec(s.packageId)?.[1].toLowerCase();
    if (suffix) found.add(SUFFIX_ARCH[suffix]);
    else if (families?.get(familyKey(s.source, s.packageId))?.has("x64") === false) found.add("x64");
  }
  return ARCHES.filter((a) => found.has(a));
}

export type ArchFilterValue = Arch | "all";

/** Odpovídá aplikace filtru platformy? Aplikace s neznámou architekturou zůstávají vidět. */
export function matchesArch(sources: ArchSource[], filter: ArchFilterValue, families?: ArchFamilies): boolean {
  if (filter === "all") return true;
  const arches = packageArchitectures(sources, families);
  return arches.length === 0 || arches.includes(filter);
}

/** Jak aplikace poběží na daném počítači. */
export type Compatibility = "native" | "emulated" | "unsupported";

/**
 * Kompatibilita podle architektur balíčku:
 *  - native: existuje instalátor přímo pro architekturu počítače,
 *  - emulated: Windows na ARM64 spustí x64/x86 aplikace v emulaci, x64 spustí x86,
 *  - unsupported: např. balíček jen pro ARM64 na x64 počítači.
 */
export function compatibility(device: Arch, available: Arch[]): Compatibility {
  if (available.includes(device)) return "native";
  if (device === "arm64" && (available.includes("x64") || available.includes("x86"))) return "emulated";
  if (device === "x64" && available.includes("x86")) return "native"; // 32bit běží na 64bit Windows bez emulace
  return "unsupported";
}
