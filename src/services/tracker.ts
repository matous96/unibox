/**
 * Sledování instalace (src-tauri/src/tracker.rs): snímek disku a registru
 * před a po instalaci; rozdíl se uloží k aplikaci a po odinstalaci ho
 * hledání zbytků nabídne ke smazání.
 */
import { invoke } from "@tauri-apps/api/core";

export interface TraceSummary {
  /** „zdroj:id balíčku“. */
  key: string;
  appName: string;
  /** Sekundy od 1970. */
  updatedAt: number;
  /** Složky a zástupci. */
  folders: number;
  /** Klíče a hodnoty registru. */
  keys: number;
}

/** Klíč záznamu aplikace. */
export const traceKey = (source: string, packageId: string) => `${source}:${packageId}`;

export const traceBegin = () => invoke<number>("trace_begin");
export const traceEnd = (token: number, key: string, appName: string) => invoke<number>("trace_end", { token, key, appName });
export const traceDiscard = (token: number) => invoke<void>("trace_discard", { token });
export const installTraces = () => invoke<TraceSummary[]>("install_traces");
export const forgetTrace = (key: string) => invoke<void>("forget_trace", { key });
