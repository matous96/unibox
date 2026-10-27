/**
 * Úvodní průvodce pro nové uživatele (components/layout/OnboardingDialog.tsx):
 *  - hasCompletedOnboarding se ukládá do localStorage; při prvním spuštění po
 *    instalaci je false a průvodce se ukáže sám,
 *  - kdo Unibox používal už dřív (v úložišti jsou jeho data – HAD_PREVIOUS_RUN),
 *    průvodce automaticky neuvidí,
 *  - dokončením i přeskočením se uloží true; znovu ho spustí Nastavení →
 *    Obecné → „Znovu spustit úvodní tutoriál“ (show).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HAD_PREVIOUS_RUN } from "./whatsNew";

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  /** Průvodce je otevřený (neukládá se). */
  open: boolean;
  show: () => void;
  /** Dokončení i přeskočení – průvodce se příště sám neukáže. */
  complete: () => void;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: HAD_PREVIOUS_RUN,
      open: false,
      show: () => set({ open: true }),
      complete: () => set({ open: false, hasCompletedOnboarding: true }),
    }),
    {
      name: "unibox-onboarding",
      partialize: ({ hasCompletedOnboarding }) => ({ hasCompletedOnboarding }),
    },
  ),
);
