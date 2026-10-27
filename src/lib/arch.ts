import type { Arch } from "@/types";
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
