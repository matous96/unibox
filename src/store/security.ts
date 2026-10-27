/**
 * Oprávnění správce a další nebezpečná nastavení (Nastavení → Oprávnění
 * správce, po vzoru UniGetUI). Vše je ve výchozím stavu vypnuté.
 *
 * Nastavení se posílá do backendu (příkaz `set_security_policy`, hook
 * useSecurityPolicySync) – podle něj backend řídí povýšení přes UAC, vlastní
 * argumenty, příkazy před / po instalaci a cesty ke správcům balíčků.
 * Frontend podle něj skrývá odpovídající volby a čistí importované sady.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InstallOptions } from "@/types";

/** Správci, kterým jde nastavit vlastní cestu ke spustitelnému souboru. */
export type PathManager = "winget" | "chocolatey" | "scoop";

export interface SecurityPolicy {
  /** Každou operaci spustit s právy správce (UAC). */
  elevateAlways: boolean;
  /** O práva správce požádat jen jednou za spuštění Uniboxu (povýšený pomocník zůstane běžet). */
  elevateOnce: boolean;
  /** Zakázat jakékoli povýšení – operace, která se nepovýší sama, selže. */
  elevationProhibited: boolean;
  /** Delegovat operace na broker Devolutions Agent (zatím nepodporováno). */
  devolutionsBroker: boolean;
  /** Povolit vlastní argumenty příkazového řádku (volby instalace). */
  allowCustomArgs: boolean;
  /** Povolit vlastní příkazy před instalací a po ní. */
  allowPrePostCommands: boolean;
  /** Povolit změnu cest ke spustitelným souborům správců balíčků. */
  allowCustomManagerPaths: boolean;
  managerPaths: Partial<Record<PathManager, string>>;
  /** Při importu sady převzít vlastní argumenty příkazového řádku. */
  allowImportCustomArgs: boolean;
  /** Při importu sady převzít příkazy před instalací a po ní. */
  allowImportPrePostCommands: boolean;
}

interface SecurityState extends SecurityPolicy {
  set: (changes: Partial<SecurityPolicy>) => void;
}

export const useSecurity = create<SecurityState>()(
  persist(
    (set) => ({
      elevateAlways: false,
      elevateOnce: false,
      elevationProhibited: false,
      devolutionsBroker: false,
      allowCustomArgs: false,
      allowPrePostCommands: false,
      allowCustomManagerPaths: false,
      managerPaths: {},
      allowImportCustomArgs: false,
      allowImportPrePostCommands: false,
      set: (changes) => set(changes),
    }),
    { name: "unibox-security" },
  ),
);

/**
 * Volby instalace podle povolení: bez povolení zmizí vlastní argumenty,
 * příkazy před / po instalaci a při zákazu povýšení i „jako správce“.
 * (Backend totéž hlídá znovu – viz set_security_policy.)
 */
export function applySecurityPolicy(options: InstallOptions | undefined): InstallOptions | undefined {
  if (!options) return options;
  const s = useSecurity.getState();
  const result = { ...options };
  if (!s.allowCustomArgs) delete result.customArgs;
  if (!s.allowPrePostCommands) {
    delete result.preCommand;
    delete result.postCommand;
  }
  if (s.elevationProhibited) delete result.asAdmin;
  return result;
}

/** Volby převzaté z importované sady: vlastní argumenty a příkazy jen s povolením importu. */
export function sanitizeImportedOptions(options: InstallOptions | undefined): InstallOptions | undefined {
  if (!options) return options;
  const s = useSecurity.getState();
  const result = { ...options };
  if (!s.allowImportCustomArgs) delete result.customArgs;
  if (!s.allowImportPrePostCommands) {
    delete result.preCommand;
    delete result.postCommand;
  }
  return Object.keys(result).length ? result : undefined;
}

/** Nastavení pro backend (jen to, co backend uplatňuje). */
export function backendPolicy(s: SecurityPolicy) {
  const allowed = !s.elevationProhibited;
  return {
    elevationProhibited: s.elevationProhibited,
    alwaysElevate: allowed && s.elevateAlways,
    // Práva správce se vyžádají jednou a povýšený pomocník pak obslouží další operace
    cacheElevation: allowed && s.elevateOnce,
    allowCustomArgs: s.allowCustomArgs,
    allowPrePostCommands: s.allowPrePostCommands,
    // Cesty jen se zapnutým povolením – jinak backend používá výchozí
    managerPaths: s.allowCustomManagerPaths ? s.managerPaths : {},
  };
}
