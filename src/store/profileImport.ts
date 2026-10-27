/**
 * Načtený profil počítače čekající na potvrzení (dialog ProfileImportDialog):
 * souhrn aplikací, převzetí nastavení a instalace všeho jedním kliknutím.
 */
import { create } from "zustand";
import { useAutoUpdates } from "./autoUpdates";
import type { BundleFile, ProfileConfig } from "./bundle";
import { useUpdatePins } from "./updatePins";

interface ProfileImportState {
  pending: BundleFile | null;
  show: (profile: BundleFile) => void;
  close: () => void;
}

export const useProfileImport = create<ProfileImportState>()((set) => ({
  pending: null,
  show: (pending) => set({ pending }),
  close: () => set({ pending: null }),
}));

/**
 * Převezme nastavení z profilu: ignorované / odložené aktualizace
 * a automatické aktualizace. Stávající nastavení se nepřepisuje.
 * Vrátí, kolik položek přibylo.
 */
export function applyProfileConfig(config: ProfileConfig): number {
  let added = config.pins ? useUpdatePins.getState().merge(config.pins) : 0;
  if (config.autoUpdate?.length) {
    const { selected, set } = useAutoUpdates.getState();
    const fresh = config.autoUpdate.filter((key) => !selected.includes(key));
    if (fresh.length) set({ selected: [...selected, ...fresh] });
    added += fresh.length;
  }
  return added;
}
