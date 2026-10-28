/**
 * Stav aktualizace Uniboxu: nalezená verze, dialog „Je k dispozici nová
 * verze…“, průběh instalace. Ukládá se jen nastavení (automatická kontrola)
 * a přeskočená verze.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { findUpdate, installUpdate, type Update } from "@/services/updates";

type CheckResult = "available" | "current" | "error";

interface AppUpdateState {
  update: Update | null;
  dialogOpen: boolean;
  checking: boolean;
  installing: boolean;
  /** Průběh stažení v procentech (null = neznámý). */
  progress: number | null;
  error: string | null;
  /** Kontrolovat aktualizace při spuštění. */
  autoCheck: boolean;
  /** Verze, kterou uživatel přeskočil – automatická kontrola ji nenabídne. */
  skippedVersion: string | null;

  /** `manual` = z nabídky / nastavení: nabídne i přeskočenou verzi. */
  check: (manual: boolean) => Promise<CheckResult>;
  install: () => Promise<void>;
  later: () => void;
  skip: () => void;
  setAutoCheck: (value: boolean) => void;
}

export const useAppUpdate = create<AppUpdateState>()(
  persist(
    (set, get) => ({
      update: null,
      dialogOpen: false,
      checking: false,
      installing: false,
      progress: null,
      error: null,
      autoCheck: true,
      skippedVersion: null,

      check: async (manual) => {
        if (get().checking || get().installing) return "current";
        set({ checking: true });
        try {
          const update = await findUpdate();
          if (!update || (!manual && update.version === get().skippedVersion)) {
            set({ checking: false });
            return "current";
          }
          set({ update, dialogOpen: true, checking: false, error: null, progress: null });
          return "available";
        } catch (error) {
          console.warn("Kontrola aktualizací Uniboxu selhala:", error);
          set({ checking: false });
          return "error";
        }
      },

      install: async () => {
        const update = get().update;
        if (!update) return;
        set({ installing: true, progress: 0, error: null });
        try {
          await installUpdate(update, (progress) => set({ progress }));
        } catch (error) {
          // Skutečná příčina (síť, podpis…) – v dialogu pod obecnou hláškou, ať jde nahlásit
          console.error("Aktualizaci Uniboxu se nepodařilo nainstalovat:", error);
          set({ installing: false, error: error instanceof Error ? error.message : String(error) });
        }
      },

      later: () => set({ dialogOpen: false }),
      skip: () => set({ dialogOpen: false, skippedVersion: get().update?.version ?? null }),
      setAutoCheck: (autoCheck) => set({ autoCheck }),
    }),
    {
      name: "unibox-app-update",
      partialize: (s) => ({ autoCheck: s.autoCheck, skippedVersion: s.skippedVersion }),
    },
  ),
);
