/**
 * Aplikace po spuštění Windows (src-tauri/src/startup.rs): registr Run,
 * složky Po spuštění a úlohy plánovače se spuštěním při přihlášení / startu.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/tauri";

export type StartupSource = "registry" | "folder" | "task";
export type StartupImpact = "high" | "medium" | "low";

export interface StartupItem {
  id: string;
  source: StartupSource;
  /** Pro všechny uživatele počítače. */
  machine: boolean;
  name: string;
  /** Popis programu (FileDescription) – jako název ve Správci úloh. */
  description: string | null;
  publisher: string | null;
  command: string;
  target: string | null;
  /** Klíč registru, složka nebo cesta úlohy. */
  location: string;
  enabled: boolean;
  /** Změna nejspíš vyžaduje práva správce. */
  admin: boolean;
  /** Spouštěný program na disku chybí. */
  missing: boolean;
  /** Vliv podle posledního měření; null = neměřeno (nebo se nespustila). */
  impact: StartupImpact | null;
  cpuMs: number | null;
  diskBytes: number | null;
}

export interface StartupList {
  items: StartupItem[];
  /** Kdy Windows vliv naposledy měřil (sekundy od 1970). */
  measuredAt: number | null;
  tasksError: string | null;
}

export interface StartupOutcome {
  done: boolean;
  /** Bez práv správce to nejde (povýšení zakázané nebo dialog UAC odmítnut). */
  needsAdmin: boolean;
  backup: string | null;
}

const EMPTY: StartupList = { items: [], measuredAt: null, tasksError: null };

export const startupItems = () => (isTauri() ? invoke<StartupList>("startup_items") : Promise.resolve(EMPTY));

export const setStartupEnabled = (id: string, enabled: boolean, elevate: boolean) =>
  invoke<StartupOutcome>("startup_set_enabled", { id, enabled, elevate });

export const deleteStartupItem = (id: string, elevate: boolean) => invoke<StartupOutcome>("startup_delete", { id, elevate });

/** Načte poslední měření Windows (s povýšením); false = UAC odmítnut / povýšení zakázané. */
export const measureStartupImpact = (elevate: boolean) => invoke<boolean>("startup_measure_impact", { elevate });

/** Název položky jako ve Správci úloh: popis programu, jinak název položky. */
export const startupTitle = (item: StartupItem) => item.description?.trim() || item.name;
