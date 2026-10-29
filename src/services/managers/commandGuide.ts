/**
 * Příkazy pro terminál – výuka pro všechny správce balíčků (stránka Příkazy pro terminál)
 * a doplňkové příkazy k aplikaci v jejím detailu (informace, verze, zamknutí verze).
 *
 * Instalace, aktualizace, odinstalace, stažení a mezipaměť se skládají stejně jako
 * v sources.ts (sourceCommand, downloadCommand, cacheCleanCommand) – výuka tak ukazuje
 * přesně to, co spouští Unibox. null = správce danou věc neumí.
 */
import type { SourceId } from "@/types";
import { cacheCleanCommand, downloadCommand, sourceCommand } from "./sources";

/** Doplňkové příkazy k jedné aplikaci (detail aplikace i výuka). */
export type AppCommandKind = "info" | "versions" | "pin" | "unpin" | "repair";

export function appCommand(source: SourceId, kind: AppCommandKind, packageId: string): string | null {
  // Scoop mimo instalaci pracuje s názvem aplikace bez bucketu („extras/firefox“ → „firefox“)
  const app = packageId.split("/").pop()!;
  switch (source) {
    case "winget":
      return {
        info: `winget show -e --id ${packageId}`,
        versions: `winget show -e --id ${packageId} --versions`,
        pin: `winget pin add -e --id ${packageId}`,
        unpin: `winget pin remove -e --id ${packageId}`,
        repair: `winget repair -e --id ${packageId}`,
      }[kind];
    case "chocolatey":
      return {
        info: `choco info ${packageId}`,
        versions: `choco search ${packageId} --exact --all-versions`,
        pin: `choco pin add -n=${packageId}`,
        unpin: `choco pin remove -n=${packageId}`,
        repair: null,
      }[kind];
    case "scoop":
      return { info: `scoop info ${app}`, versions: null, pin: `scoop hold ${app}`, unpin: `scoop unhold ${app}`, repair: null }[kind];
    case "npm":
      return { info: `npm view ${packageId}`, versions: `npm view ${packageId} versions`, pin: null, unpin: null, repair: null }[kind];
    case "pip":
      return { info: `python -m pip show ${packageId}`, versions: `python -m pip index versions ${packageId}`, pin: null, unpin: null, repair: null }[kind];
    case "cargo":
      return { info: `cargo info ${packageId}`, versions: null, pin: null, unpin: null, repair: null }[kind];
    case "dotnet":
      return { info: `dotnet tool search ${packageId} --detail`, versions: null, pin: null, unpin: null, repair: null }[kind];
    case "pwsh":
      return { info: `Find-PSResource -Name ${packageId}`, versions: `Find-PSResource -Name ${packageId} -Version *`, pin: null, unpin: null, repair: null }[kind];
    case "powershell":
      return { info: `Find-Module -Name ${packageId}`, versions: `Find-Module -Name ${packageId} -AllVersions`, pin: null, unpin: null, repair: null }[kind];
    default:
      return null;
  }
}

/** Příkazy pro celého správce (bez konkrétní aplikace). */
type ManagerCommandKind =
  | "version"
  | "selfUpdate"
  | "diagnose"
  | "settings"
  | "search"
  | "list"
  | "outdated"
  | "updateAll"
  | "pinList"
  | "export"
  | "import"
  | "sources"
  | "addSource"
  | "refresh"
  | "hash"
  | "validate";

function managerCommand(source: SourceId, kind: ManagerCommandKind, query: string): string | null {
  const table: Record<SourceId, Partial<Record<ManagerCommandKind, string>>> = {
    winget: {
      version: "winget --version",
      // Verze, cesty k protokolům a nastavení, zásady skupiny
      diagnose: "winget --info",
      // Otevře settings.json ve výchozím editoru
      settings: "winget settings",
      search: `winget search ${query}`,
      list: "winget list",
      outdated: "winget upgrade",
      updateAll: "winget upgrade --all",
      pinList: "winget pin list",
      export: "winget export -o apps.json",
      import: "winget import -i apps.json",
      sources: "winget source list",
      refresh: "winget source update",
      // Pro tvůrce aplikací (Publikovat → WinGet)
      hash: "winget hash -f setup.exe",
      validate: "winget validate --manifest .\\manifest",
    },
    chocolatey: {
      version: "choco --version",
      selfUpdate: "choco upgrade chocolatey -y",
      settings: "choco config list",
      search: `choco search ${query}`,
      list: "choco list",
      outdated: "choco outdated",
      updateAll: "choco upgrade all -y",
      pinList: "choco pin list",
      export: "choco export packages.config",
      import: "choco install packages.config -y",
      sources: "choco source list",
    },
    scoop: {
      version: "scoop --version",
      // Zkontroluje časté problémy (dlouhé cesty, Defender, chybějící 7-Zip…)
      diagnose: "scoop checkup",
      settings: "scoop config",
      search: `scoop search ${query}`,
      list: "scoop list",
      outdated: "scoop status",
      updateAll: "scoop update *",
      export: "scoop export > scoopfile.json",
      import: "scoop import scoopfile.json",
      sources: "scoop bucket list",
      addSource: "scoop bucket add extras",
      // Aktualizuje Scoop i seznamy aplikací v bucketech
      refresh: "scoop update",
    },
    npm: {
      version: "npm --version",
      selfUpdate: "npm install -g npm@latest",
      diagnose: "npm doctor",
      settings: "npm config list",
      search: `npm search ${query}`,
      list: "npm ls -g --depth=0",
      outdated: "npm outdated -g",
      updateAll: "npm update -g",
      sources: "npm config get registry",
    },
    bun: {
      version: "bun --version",
      selfUpdate: "bun upgrade",
      // Globální balíčky Bun zapisuje do package.json ve své složce (čte ho i Unibox)
      list: 'Get-Content "$env:USERPROFILE\\.bun\\install\\global\\package.json"',
    },
    pip: {
      version: "python -m pip --version",
      selfUpdate: "python -m pip install --upgrade pip",
      // Ověří, že nainstalované balíčky mají kompatibilní závislosti
      diagnose: "python -m pip check",
      settings: "python -m pip config list",
      list: "python -m pip list",
      outdated: "python -m pip list --outdated",
      export: "python -m pip freeze > requirements.txt",
      import: "python -m pip install -r requirements.txt",
    },
    cargo: {
      version: "cargo --version",
      selfUpdate: "rustup update",
      // Nainstalované toolchainy Rustu a výchozí cíl
      diagnose: "rustup show",
      search: `cargo search ${query}`,
      list: "cargo install --list",
    },
    vcpkg: {
      version: "vcpkg version",
      search: `vcpkg search ${query}`,
      list: "vcpkg list",
      // Bez --no-dry-run jen vypíše, co je zastaralé
      outdated: "vcpkg upgrade",
      updateAll: "vcpkg upgrade --no-dry-run",
    },
    dotnet: {
      version: "dotnet --version",
      diagnose: "dotnet --info",
      search: `dotnet tool search ${query}`,
      list: "dotnet tool list --global",
      sources: "dotnet nuget list source",
    },
    pwsh: {
      version: "Get-Module Microsoft.PowerShell.PSResourceGet -ListAvailable",
      selfUpdate: "Update-PSResource -Name Microsoft.PowerShell.PSResourceGet",
      search: `Find-PSResource -Name *${query}*`,
      list: "Get-InstalledPSResource",
      updateAll: "Update-PSResource",
      sources: "Get-PSResourceRepository",
    },
    powershell: {
      version: "Get-Module PowerShellGet -ListAvailable",
      search: `Find-Module -Name *${query}*`,
      list: "Get-InstalledModule",
      updateAll: "Update-Module",
      sources: "Get-PSRepository",
    },
  };
  return table[source][kind] ?? null;
}

/** Ukázková aplikace pro každého správce – příklady jdou rovnou zkopírovat a spustit. */
export const GUIDE_EXAMPLES: Record<SourceId, { packageId: string; query: string }> = {
  winget: { packageId: "Mozilla.Firefox", query: "firefox" },
  chocolatey: { packageId: "firefox", query: "firefox" },
  scoop: { packageId: "extras/firefox", query: "firefox" },
  npm: { packageId: "typescript", query: "typescript" },
  bun: { packageId: "typescript", query: "typescript" },
  pip: { packageId: "black", query: "black" },
  cargo: { packageId: "ripgrep", query: "ripgrep" },
  vcpkg: { packageId: "fmt", query: "fmt" },
  dotnet: { packageId: "dotnet-ef", query: "dotnet-ef" },
  pwsh: { packageId: "PSScriptAnalyzer", query: "ScriptAnalyzer" },
  powershell: { packageId: "PSScriptAnalyzer", query: "ScriptAnalyzer" },
};

export type GuideCommandId =
  | ManagerCommandKind
  | AppCommandKind
  | "install"
  | "installVersion"
  | "download"
  | "uninstall"
  | "update"
  | "cache";

/** Skupiny výuky v pořadí, jak se se správcem obvykle pracuje. */
export const GUIDE_GROUPS: { id: string; commands: GuideCommandId[] }[] = [
  { id: "start", commands: ["version", "selfUpdate", "diagnose", "settings"] },
  { id: "find", commands: ["search", "info", "versions"] },
  { id: "install", commands: ["install", "installVersion", "download", "repair", "uninstall"] },
  { id: "update", commands: ["outdated", "update", "updateAll", "pin", "unpin", "pinList"] },
  { id: "overview", commands: ["list", "export", "import"] },
  { id: "maintenance", commands: ["sources", "addSource", "refresh", "cache"] },
  { id: "publish", commands: ["hash", "validate"] },
];

/**
 * Příkaz výuky s ukázkovou aplikací správce, nebo se zástupnými texty (`example`:
 * „<ID>“, „<název>“); `version` je zástupný text verze („<verze>“).
 */
export function guideCommand(
  source: SourceId,
  id: GuideCommandId,
  version: string,
  example: { packageId: string; query: string } = GUIDE_EXAMPLES[source],
): string | null {
  const { packageId, query } = example;
  switch (id) {
    case "install":
    case "update":
    case "uninstall":
      return sourceCommand(source, id, packageId);
    case "installVersion": {
      const command = sourceCommand(source, "install", packageId, version);
      // Bez podpory verzí by příkaz byl stejný jako běžná instalace
      return command === sourceCommand(source, "install", packageId) ? null : command;
    }
    case "download":
      return downloadCommand(source, packageId);
    case "cache":
      return cacheCleanCommand(source);
    case "info":
    case "versions":
    case "pin":
    case "unpin":
    case "repair":
      return appCommand(source, id, packageId);
    default:
      return managerCommand(source, id, query);
  }
}
