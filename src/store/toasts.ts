import { create } from "zustand";
import { useNotifications } from "./notifications";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastOptions {
  /**
   * Zapsat i do centra oznámení (zvoneček). Výchozí: jen chyby – úspěšná
   * drobná potvrzení („Zkopírováno“) by historii zahltila. Fronta úloh
   * zapisuje své výsledky sama i s názvem aplikace, proto posílá false.
   */
  record?: boolean;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

/** Jednoduché krátkodobé notifikace v rohu okna (zmizí po 4 s). */
export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (tone, message, options) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, tone, message }] });
    setTimeout(() => get().dismiss(id), 4000);
    if (options?.record ?? tone === "error") useNotifications.getState().add({ tone, title: null, message });
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
