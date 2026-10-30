/**
 * Vygeneruje PowerShell skript (.ps1), který nainstaluje celou sadu balíčků
 * příkazy jednotlivých správců. Hodí se pro nový počítač nebo pro více počítačů.
 */
import { getSource, SOURCE_IDS, unattendedInstallCommand } from "@/services/managers";
import type { BundleItem } from "@/store/bundle";

/** Texty ve skriptu (skript se otevírá mimo aplikaci, proto ne přes i18next). */
const TEXTS = {
  cs: {
    title: "sada balíčků",
    generated: (date: string, count: number) => `Vygenerováno ${date} · balíčků: ${count}`,
    run: "Spuštění",
    admin: "Chocolatey vyžaduje PowerShell spuštěný jako správce.",
    installing: "Instaluji",
    done: "Hotovo.",
  },
  en: {
    title: "package bundle",
    generated: (date: string, count: number) => `Generated ${date} · packages: ${count}`,
    run: "Run",
    admin: "Chocolatey requires PowerShell running as administrator.",
    installing: "Installing",
    done: "Done.",
  },
};

export function buildBundleScript(name: string, items: BundleItem[], locale: string, fileName = "bundle.ps1"): string {
  const text = locale.startsWith("cs") ? TEXTS.cs : TEXTS.en;
  const needsAdmin = items.some((i) => getSource(i.source).needsAdmin);
  const lines: string[] = [
    `# HubGet – ${text.title}${name ? ` "${name}"` : ""}`,
    `# ${text.generated(new Date().toLocaleString(locale), items.length)}`,
    `# ${text.run}:  powershell -ExecutionPolicy Bypass -File .\\${fileName}`,
  ];
  if (needsAdmin) lines.push(`# ${text.admin}`);
  lines.push("", "$ErrorActionPreference = 'Continue'", "");

  // Seskupit podle správce, ať je skript přehledný
  for (const source of SOURCE_IDS) {
    const group = items.filter((i) => i.source === source);
    if (!group.length) continue;
    lines.push(`# ── ${getSource(source).label} ──`);
    for (const item of group) {
      lines.push(`Write-Host "${text.installing} ${item.name.replace(/["`$]/g, "")}…" -ForegroundColor Cyan`);
      const command = unattendedInstallCommand(item.source, item.packageId, item.version);
      // Moduly PowerShellu se instalují do konkrétní verze PowerShellu – spustit v ní
      if (item.source === "pwsh") lines.push(`pwsh -NoProfile -Command "${command}"`);
      else if (item.source === "powershell") lines.push(`powershell -NoProfile -Command "${command}"`);
      else lines.push(command);
    }
    lines.push("");
  }
  lines.push(`Write-Host "${text.done}" -ForegroundColor Green`, "");
  return lines.join("\r\n");
}

/** Příkazy sady jako prostý text (jeden řádek na balíček). */
export function bundleCommands(items: BundleItem[]): string {
  return items.map((i) => unattendedInstallCommand(i.source, i.packageId, i.version)).join("\n");
}
