/**
 * Protokol správců balíčků – co Unibox spouští a jak to dopadlo.
 * Uchovává se jen do zavření aplikace (jako v UniGetUI); slouží
 * k dohledání, proč instalace selhala.
 */
import { create } from "zustand";
import type { SourceId } from "@/types";

/** `output` = řádek výstupu spuštěného příkazu (jen v desktopové aplikaci). */
export type LogLevel = "command" | "output" | "info" | "success" | "warning" | "error";

export interface LogEntry {
  id: number;
  /** Čas v ms (Date.now()). */
  time: number;
  source: SourceId;
  level: LogLevel;
  text: string;
}

interface LogsState {
  entries: LogEntry[];
  append: (source: SourceId, level: LogLevel, text: string) => void;
  clear: () => void;
}

/** Nejvýš tolik řádků – starší se zahazují. */
const MAX_ENTRIES = 2000;
let nextId = 1;

export const useLogs = create<LogsState>()((set, get) => ({
  entries: [],
  append: (source, level, text) => {
    const entries = [...get().entries, { id: nextId++, time: Date.now(), source, level, text }];
    set({ entries: entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries });
  },
  clear: () => set({ entries: [] }),
}));

/** Zápis do protokolu i mimo React (vrstva správců, fronta úloh). */
export const writeLog = (source: SourceId, level: LogLevel, text: string) => useLogs.getState().append(source, level, text);

/** Protokol jako prostý text (kopírování, uložení do souboru). */
export function logsToText(entries: LogEntry[], locale: string): string {
  return entries
    .map((e) => `[${new Date(e.time).toLocaleTimeString(locale)}] [${e.source}] ${e.level === "command" ? "> " : ""}${e.text}`)
    .join("\n");
}
