/**
 * Centrum oznámení (zvoneček v horní liště): historie posledních událostí
 * a chyb. Plní se automaticky:
 *  - výsledky instalací, aktualizací, odinstalací a stažení z fronty úloh
 *    (store/jobs.ts – název aplikace, zdroj, chybová hláška s kódem),
 *  - chybová hlášení odjinud (spuštění aplikace, uložení souboru…) – každé
 *    oznámení s tónem „error“ (store/toasts.ts).
 * Ukládá se mezi spuštěními. Nepřečtené chyby ukazuje odznak na zvonečku,
 * otevřením panelu se označí jako přečtené.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OperationKind, SourceId } from "@/types";

export type NotificationTone = "success" | "error" | "info";

export interface AppNotification {
  id: string;
  tone: NotificationTone;
  /** Název aplikace u operace, null = obecné hlášení Uniboxu. */
  title: string | null;
  message: string;
  /** U operací z fronty: druh, zdroj a aplikace (odkaz na detail). */
  kind?: OperationKind;
  source?: SourceId;
  appId?: string;
  createdAt: string;
  read: boolean;
}

interface NotificationsState {
  items: AppNotification[];
  add: (notification: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  markAllRead: () => void;
  clear: () => void;
}

/** Nejvýš tolik záznamů – nejstarší se zahazují. */
const MAX_ITEMS = 100;

export const useNotifications = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: [],
      // Nejnovější první
      add: (notification) =>
        set({
          items: [
            { ...notification, id: crypto.randomUUID(), createdAt: new Date().toISOString(), read: false },
            ...get().items,
          ].slice(0, MAX_ITEMS),
        }),
      markAllRead: () => {
        if (get().items.some((n) => !n.read)) set({ items: get().items.map((n) => (n.read ? n : { ...n, read: true })) });
      },
      clear: () => set({ items: [] }),
    }),
    { name: "unibox-notifications" },
  ),
);

/** Počet nepřečtených chyb (odznak na zvonečku). */
export const unreadErrorCount = (items: AppNotification[]) => items.filter((n) => n.tone === "error" && !n.read).length;
