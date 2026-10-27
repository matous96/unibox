/**
 * Běžící procesy aplikace (jen desktopová aplikace) – backend
 * src-tauri/src/running.rs. Před operací, po ní a v AppInUseDialog.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/tauri";

export interface RunningProcess {
  pid: number;
  name: string;
  path: string;
  /** Má viditelné okno (i minimalizované) – uživatel s aplikací pracuje. */
  visible: boolean;
  /** Okenní program (konzolové programy se bez dotazu nezavírají). */
  gui: boolean;
  /** Leží ve složce instalace ze záznamu v registru (ne jen podle názvu). */
  certain: boolean;
}

/** Procesy aplikace podle složky instalace, názvu a id balíčku. */
export const findAppProcesses = (packageId: string, name: string): Promise<RunningProcess[]> =>
  isTauri() ? invoke<RunningProcess[]>("app_processes", { packageId, name }) : Promise.resolve([]);

/** Zavře procesy – slušně, s `force` natvrdo. Vrátí id procesů, které běží dál. */
export const closeProcesses = (pids: number[], force: boolean) => invoke<number[]>("close_processes", { pids, force });

/** Ukončí procesy bez dotazu (slušně, kdo nereaguje, natvrdo). Vrátí id těch, které ukončit nešlo. */
export const endProcesses = (pids: number[]) => invoke<number[]>("end_processes", { pids });

/**
 * Proces, který Unibox smí před operací ukončit bez dotazu: jistě patří
 * aplikaci (složka instalace z registru), nemá okno (běží na pozadí / u hodin)
 * a je okenní program – ne konzolový skript, který spustil uživatel.
 */
export const closableInBackground = (p: RunningProcess) => p.certain && !p.visible && p.gui;
