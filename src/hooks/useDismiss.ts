import { useEffect, type RefObject } from "react";
import { useOverlay } from "./useOverlay";

/** Zavře rozbalovací nabídku kliknutím mimo `ref` nebo klávesou Esc. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  // Esc jen pro nejvrchnější překryv – nabídka otevřená v dialogu nezavře i dialog
  useOverlay(open, (e) => e.key === "Escape" && onClose());
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, open, onClose]);
}
