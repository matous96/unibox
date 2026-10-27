/**
 * Synchronizace mezi počítači: oblíbené, sada balíčků, předvolby a předvolby
 * oznámení přihlášeného uživatele (services/sync.ts – Supabase, bez něj ukázka).
 *
 * Průběh: načíst data účtu → u každé zapnuté oblasti 3cestně sloučit se stavem
 * tady (základ = stav po poslední synchronizaci tohoto počítače, lib/syncMerge.ts)
 * → výsledek uložit tady i do účtu. Když mezitím zapsal jiný počítač (revize
 * nesedí), načte se znovu a sloučí znovu. Základ se pamatuje zvlášť pro
 * každého uživatele.
 *
 * Kdy: po přihlášení (i obnovené relaci při startu), 3 s po změně dat,
 * při návratu do okna (nejvýš jednou za minutu) a každých 10 minut.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mergeMaps, sameValue, type SyncMap } from "@/lib/syncMerge";
import { SyncConflict, syncBackend, type SyncKindId } from "@/services/sync";
import { useAuth } from "./auth";
import { SYNC_KIND_LIST, type SyncKind } from "./syncKinds";

type SyncStatus = "idle" | "syncing" | "error";

interface SyncState {
  /** Synchronizovat po přihlášení (výchozí zapnuto). */
  enabled: boolean;
  /** Které oblasti synchronizovat. */
  kinds: Record<SyncKindId, boolean>;
  status: SyncStatus;
  /** Poslední úspěšná synchronizace přihlášeného uživatele. */
  lastSyncedAt: string | null;
  setEnabled: (enabled: boolean) => void;
  setKind: (kind: SyncKindId, enabled: boolean) => void;
  syncNow: () => Promise<void>;
  /** Smaže data z účtu a synchronizaci vypne (jinak by se hned nahrála znovu). */
  clearAccount: () => Promise<void>;
}

/** Stav po poslední synchronizaci tohoto počítače (základ 3cestného sloučení). */
interface SyncBase {
  kinds: Partial<Record<SyncKindId, SyncMap>>;
  lastSyncedAt: string | null;
}

const BASE_KEY = (userId: string) => `unibox-sync-base:${userId}`;

function loadBase(userId: string): SyncBase {
  try {
    const raw = localStorage.getItem(BASE_KEY(userId));
    if (raw) return JSON.parse(raw) as SyncBase;
  } catch {
    // poškozený záznam – synchronizace začne jako první
  }
  return { kinds: {}, lastSyncedAt: null };
}

const saveBase = (userId: string, base: SyncBase) => localStorage.setItem(BASE_KEY(userId), JSON.stringify(base));

/** Kolikrát zkusit sloučit znovu, když mezitím zapsal jiný počítač. */
const CONFLICT_RETRIES = 3;

/** Právě se zapisují data z účtu – změny úložišť nespouštějí další synchronizaci. */
let applying = false;

function applyQuietly(kind: SyncKind, map: SyncMap) {
  applying = true;
  try {
    kind.apply(map);
  } finally {
    applying = false;
  }
}

let running: Promise<void> | null = null;
let again = false;

/** Jeden průběh synchronizace. */
async function run(get: () => SyncState, set: (s: Partial<SyncState>) => void) {
  const user = useAuth.getState().user;
  if (!user || !get().enabled) return;
  set({ status: "syncing" });
  try {
    const base = loadBase(user.id);
    let remote = await syncBackend.pull(user.id);
    for (const kind of SYNC_KIND_LIST) {
      if (!get().kinds[kind.id]) continue;
      for (let attempt = 0; ; attempt++) {
        const local = kind.snapshot();
        const record = remote[kind.id] ?? null;
        const merged = mergeMaps(base.kinds[kind.id] ?? null, local, record?.data ?? null);
        if (!sameValue(merged, local)) applyQuietly(kind, merged);
        if (!record || !sameValue(merged, record.data)) {
          try {
            await syncBackend.push(user.id, kind.id, merged, record?.revision ?? null);
          } catch (error) {
            // Jiný počítač zapsal mezi načtením a zápisem – načíst a sloučit znovu
            if (error instanceof SyncConflict && attempt < CONFLICT_RETRIES) {
              remote = await syncBackend.pull(user.id);
              continue;
            }
            throw error;
          }
        }
        base.kinds[kind.id] = merged;
        break;
      }
    }
    base.lastSyncedAt = new Date().toISOString();
    // Uživatel se mezitím mohl odhlásit nebo přepnout
    if (useAuth.getState().user?.id === user.id) {
      saveBase(user.id, base);
      set({ status: "idle", lastSyncedAt: base.lastSyncedAt });
    }
  } catch (error) {
    console.error("[Unibox] Synchronizace se nepovedla:", error);
    set({ status: "error" });
  }
}

export const useSync = create<SyncState>()(
  persist(
    (set, get) => ({
      enabled: true,
      kinds: { favorites: true, bundle: true, settings: true, notifications: true },
      status: "idle",
      lastSyncedAt: null,

      setEnabled: (enabled) => {
        set({ enabled });
        if (enabled) scheduleSync(0);
      },
      setKind: (kind, enabled) => {
        set({ kinds: { ...get().kinds, [kind]: enabled } });
        if (enabled) scheduleSync(0);
      },

      syncNow: () => {
        // Jen jeden průběh najednou; požadavek během něj spustí ještě jeden
        if (running) {
          again = true;
          return running;
        }
        running = run(get, set).finally(() => {
          running = null;
          if (again) {
            again = false;
            void get().syncNow();
          }
        });
        return running;
      },

      clearAccount: async () => {
        const user = useAuth.getState().user;
        if (!user) return;
        await running;
        await syncBackend.clear(user.id);
        localStorage.removeItem(BASE_KEY(user.id));
        set({ enabled: false, lastSyncedAt: null, status: "idle" });
      },
    }),
    {
      name: "unibox-sync",
      // Stav průběhu se neukládá – po startu se zjistí znovu
      partialize: ({ enabled, kinds }) => ({ enabled, kinds }),
    },
  ),
);

// ── Spouštění ─────────────────────────────────────────────────────────────

/** Po změně dat počkat, ať se víc změn za sebou pošle najednou. */
const CHANGE_DELAY = 3000;
const INTERVAL = 10 * 60_000;
/** Při návratu do okna nejvýš jednou za tolik. */
const FOCUS_GAP = 60_000;

let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleSync(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void useSync.getState().syncNow(), delay);
}

const active = () => !!useAuth.getState().user && useSync.getState().enabled;

// Změna dat tady – jen když se liší od stavu po poslední synchronizaci
for (const kind of SYNC_KIND_LIST) {
  kind.subscribe(() => {
    const user = useAuth.getState().user;
    if (applying || !user || !active() || !useSync.getState().kinds[kind.id]) return;
    if (sameValue(kind.snapshot(), loadBase(user.id).kinds[kind.id])) return;
    scheduleSync(CHANGE_DELAY);
  });
}

// Přihlášení, obnovená relace při startu, přepnutí účtu
useAuth.subscribe((state, prev) => {
  if (state.user?.id === prev.user?.id) return;
  useSync.setState({ status: "idle", lastSyncedAt: state.user ? loadBase(state.user.id).lastSyncedAt : null });
  if (state.user) scheduleSync(0);
});

setInterval(() => {
  if (active()) void useSync.getState().syncNow();
}, INTERVAL);

window.addEventListener("focus", () => {
  const last = useSync.getState().lastSyncedAt;
  if (active() && (!last || Date.now() - Date.parse(last) > FOCUS_GAP)) scheduleSync(0);
});
