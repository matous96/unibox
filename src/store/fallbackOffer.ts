/**
 * Nabídka záložního zdroje (FallbackOfferDialog): instalace z primárního zdroje
 * selhala (nefunkční odkaz, jiný soubor, běžící jiná instalace…), ale aplikace
 * je i u dalších správců – uživatel si vybere, odkud ji zkusit nainstalovat.
 * Víc nabídek najednou (dávka instalací) se ukáže postupně.
 */
import { create } from "zustand";
import type { PackageSource, SourceId } from "@/types";

export interface FallbackCandidate {
  source: PackageSource;
  /** Správce je nainstalovaný; jinak ho fronta před instalací nabídne nainstalovat. */
  ready: boolean;
}

export interface FallbackOffer {
  appId: string;
  appName: string;
  failedSource: SourceId;
  error: string;
  candidates: FallbackCandidate[];
}

interface FallbackOfferState {
  /** Čekající nabídky; zobrazuje se první. */
  offers: FallbackOffer[];
  open: (offer: FallbackOffer) => void;
  /** Zavře zobrazenou nabídku (případně ukáže další). */
  close: () => void;
}

export const useFallbackOffer = create<FallbackOfferState>()((set, get) => ({
  offers: [],
  // Novější nabídka pro stejnou aplikaci nahradí starší
  open: (offer) => set({ offers: [...get().offers.filter((o) => o.appId !== offer.appId), offer] }),
  close: () => set({ offers: get().offers.slice(1) }),
}));
