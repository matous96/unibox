/** Otevřená kolekce v celoobrazovkovém detailu (CollectionModal na domovské stránce). */
import { create } from "zustand";
import type { CollectionStory } from "@/data/editorial";

interface CollectionModalState {
  story: CollectionStory | null;
  open: (story: CollectionStory) => void;
  close: () => void;
}

export const useCollectionModal = create<CollectionModalState>()((set) => ({
  story: null,
  open: (story) => set({ story }),
  close: () => set({ story: null }),
}));
