/**
 * Posuvná oblast obsahu okna (<main> v app/Layout.tsx). Virtualizované seznamy
 * (PackageCollection) podle ní počítají, které položky jsou právě vidět.
 */
import { createContext, useContext, type RefObject } from "react";

export const ScrollContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

/** Ref posuvné oblasti obsahu; null mimo rozvržení okna (např. v testech). */
export function useScrollContainer() {
  return useContext(ScrollContainerContext);
}
