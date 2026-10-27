/**
 * Výzva k instalaci chybějícího správce balíčků (Chocolatey, Scoop): když
 * se má instalovat z nenainstalovaného správce, fronta úloh se zeptá
 * (ManagerSetupDialog) a počká na odpověď – po instalaci správce pokračuje.
 */
import { create } from "zustand";
import type { SourceId } from "@/types";

interface ManagerSetupState {
  /** Správce, na kterého se dialog ptá (null = zavřeno). */
  source: SourceId | null;
  resolve: ((installed: boolean) => void) | null;
  /** Zeptá se na instalaci správce; true = správce je nainstalovaný a jde pokračovat. */
  request: (source: SourceId) => Promise<boolean>;
  /** Odpověď z dialogu. */
  finish: (installed: boolean) => void;
}

export const useManagerSetup = create<ManagerSetupState>()((set, get) => ({
  source: null,
  resolve: null,
  request: (source) =>
    new Promise<boolean>((resolve) => {
      // Předchozí nevyřízená otázka (jiný správce) se bere jako zrušená
      get().resolve?.(false);
      set({ source, resolve });
    }),
  finish: (installed) => {
    get().resolve?.(installed);
    set({ source: null, resolve: null });
  },
}));
