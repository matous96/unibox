/**
 * Listování v kartách sekce „Dnes“ (šipky ‹ › na kartách) – posun každé karty
 * o „dny“ v pořadí výběru (lib/today.ts). Pamatuje si ho do zavření HubGetu,
 * aby návrat z detailu aplikace ukázal stejné karty; s novým dnem začíná od nuly.
 */
import { create } from "zustand";
import { dayIndex } from "@/data/editorial";
import { NO_SHIFT, type TodayShift } from "@/lib/today";

/** Karty, které jde listovat (aplikace dne je jedna na celý den). */
export type TodaySlot = "story" | "collection0" | "collection1";

interface TodayPagerState {
  /** Den, ke kterému posun patří. */
  day: number;
  shift: TodayShift;
  move: (slot: TodaySlot, by: number) => void;
}

export const useTodayPager = create<TodayPagerState>()((set, get) => ({
  day: dayIndex(),
  shift: NO_SHIFT,
  move: (slot, by) => {
    const today = dayIndex();
    const { story, collections } = get().day === today ? get().shift : NO_SHIFT;
    const shift: TodayShift =
      slot === "story"
        ? { story: story + by, collections }
        : { story, collections: slot === "collection0" ? [collections[0] + by, collections[1]] : [collections[0], collections[1] + by] };
    set({ day: today, shift });
  },
}));

/** Posun pro dnešek (posun z minulého dne už neplatí). */
export const useTodayShift = () => useTodayPager((s) => (s.day === dayIndex() ? s.shift : NO_SHIFT));
