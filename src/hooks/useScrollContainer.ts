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

/**
 * Posun, který rozvržení po návratu Zpět / Vpřed obnovuje (jinak null). Virtualizovaný
 * seznam se připojí dřív, než ho rozvržení stihne nastavit – převezme ho jako výchozí
 * pozici, jinak by ho při dorovnání výšek řádků vrátil na svou nulu.
 */
export const scrollRestore: { target: number | null } = { target: null };
