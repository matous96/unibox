/**
 * Stav dialogů instalace a kontextové nabídky. Dialogy i nabídka jsou v aplikaci
 * jen jednou (viz InstallUiHost v Layoutu), takže přežijí zavření nabídky,
 * ze které se otevřely.
 */
import { create } from "zustand";
import type { CatalogEntry, SourceId } from "@/types";

interface ContextMenuState {
  entry: CatalogEntry;
  /** Pozice v okně (px). */
  x: number;
  y: number;
}

interface InstallUiState {
  /** Aplikace, jejíž dialog Možnosti instalace je otevřený. */
  options: { entry: CatalogEntry; source?: SourceId } | null;
  /** Aplikace, jejíž dialog Ruční instalace je otevřený. */
  manual: { entry: CatalogEntry; source?: SourceId } | null;
  menu: ContextMenuState | null;
  openOptions: (entry: CatalogEntry, source?: SourceId) => void;
  openManual: (entry: CatalogEntry, source?: SourceId) => void;
  openMenu: (entry: CatalogEntry, x: number, y: number) => void;
  closeOptions: () => void;
  closeManual: () => void;
  closeMenu: () => void;
}

export const useInstallUi = create<InstallUiState>()((set) => ({
  options: null,
  manual: null,
  menu: null,
  openOptions: (entry, source) => set({ options: { entry, source }, menu: null }),
  openManual: (entry, source) => set({ manual: { entry, source }, menu: null }),
  openMenu: (entry, x, y) => set({ menu: { entry, x, y } }),
  closeOptions: () => set({ options: null }),
  closeManual: () => set({ manual: null }),
  closeMenu: () => set({ menu: null }),
}));
