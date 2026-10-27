/**
 * Ignorované, přeskočené a odložené aktualizace (jako „Ignorovat aktualizace“
 * v UniGetUI):
 *  - skip: přeskočit konkrétní verzi – až vyjde ještě novější, nabídne se znovu,
 *  - lock: ignorovat aktualizace (zamknout nainstalovanou verzi) – aktualizace
 *    se nenabízejí, dokud se zámek nezruší (Nastavení → Ignorované
 *    aktualizace, nebo v detailu),
 *  - snooze: odložit aktualizaci o den, týden či měsíc – pak se sama nabídne.
 *
 * Klíčem je nainstalovaný balíček („winget:Mozilla.Firefox“), ne karta
 * katalogu. Zámky uplatní useInstalled (hooks/usePackages.ts) – skrytá
 * aktualizace pak pro celou aplikaci neexistuje: odznaky, počty, „Aktualizovat
 * vše“, automatické aktualizace i ikona u hodin.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InstalledPackage } from "@/types";

export type UpdatePin =
  | { kind: "skip"; version: string; name: string; at: string }
  | { kind: "lock"; name: string; at: string }
  | { kind: "snooze"; until: string; name: string; at: string };

export type UpdatePins = Record<string, UpdatePin>;

/** Nabízené délky odložení (dny). */
export const SNOOZE_DAYS = [1, 7, 30] as const;
export type SnoozeDays = (typeof SNOOZE_DAYS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Klíč zámku: zdroj a id nainstalovaného balíčku. */
export const pinKey = (pkg: Pick<InstalledPackage, "source" | "packageId">) => `${pkg.source}:${pkg.packageId}`;

/** Platí odložení ještě? */
export const snoozeActive = (pin: UpdatePin, now = Date.now()) => pin.kind !== "snooze" || Date.parse(pin.until) > now;

interface UpdatePinsState {
  pins: UpdatePins;
  /** Přeskočit aktuálně nabízenou verzi. */
  skip: (pkg: InstalledPackage, name: string) => void;
  /** Ignorovat aktualizace (zamknout nainstalovanou verzi). */
  lock: (pkg: InstalledPackage, name: string) => void;
  /** Odložit aktualizace o zadaný počet dní. */
  snooze: (pkg: InstalledPackage, name: string, days: SnoozeDays) => void;
  unpin: (key: string) => void;
  /** Přidá zámky ze souboru profilu (stávající nepřepisuje). */
  merge: (pins: UpdatePins) => number;
  /** Odebere prošlá odložení – aktualizace se tím znovu nabídnou. */
  pruneExpired: () => void;
}

export const useUpdatePins = create<UpdatePinsState>()(
  persist(
    (set, get) => ({
      pins: {},
      skip: (pkg, name) => {
        const version = pkg.availableVersion ?? pkg.heldVersion;
        if (!version) return;
        set({ pins: { ...get().pins, [pinKey(pkg)]: { kind: "skip", version, name, at: new Date().toISOString() } } });
      },
      lock: (pkg, name) => set({ pins: { ...get().pins, [pinKey(pkg)]: { kind: "lock", name, at: new Date().toISOString() } } }),
      snooze: (pkg, name, days) => {
        const now = Date.now();
        const until = new Date(now + days * DAY_MS).toISOString();
        set({ pins: { ...get().pins, [pinKey(pkg)]: { kind: "snooze", until, name, at: new Date(now).toISOString() } } });
      },
      unpin: (key) => {
        const pins = { ...get().pins };
        delete pins[key];
        set({ pins });
      },
      merge: (incoming) => {
        const pins = { ...get().pins };
        let added = 0;
        for (const [key, pin] of Object.entries(incoming)) {
          if (pins[key] || !isUpdatePin(pin) || !snoozeActive(pin)) continue;
          pins[key] = pin;
          added++;
        }
        if (added) set({ pins });
        return added;
      },
      pruneExpired: () => {
        const now = Date.now();
        const pins = get().pins;
        const kept = Object.fromEntries(Object.entries(pins).filter(([, pin]) => snoozeActive(pin, now)));
        if (Object.keys(kept).length !== Object.keys(pins).length) set({ pins: kept });
      },
    }),
    { name: "unibox-update-pins" },
  ),
);

/** Kontrola tvaru zámku ze souboru (import profilu). */
export function isUpdatePin(value: unknown): value is UpdatePin {
  if (!value || typeof value !== "object") return false;
  const pin = value as Record<string, unknown>;
  if (typeof pin.name !== "string" || typeof pin.at !== "string") return false;
  if (pin.kind === "lock") return true;
  if (pin.kind === "skip") return typeof pin.version === "string";
  if (pin.kind === "snooze") return typeof pin.until === "string" && !Number.isNaN(Date.parse(pin.until));
  return false;
}

/**
 * Uplatní zámky na seznam nainstalovaných: skrytá aktualizace = availableVersion
 * null, nabízená verze zůstane v `heldVersion` a druh zámku v `pin`.
 */
export function applyPins(data: InstalledPackage[], pins: UpdatePins, now = Date.now()): InstalledPackage[] {
  if (Object.keys(pins).length === 0) return data;
  return data.map((pkg) => {
    const pin = pins[pinKey(pkg)];
    if (!pin) return pkg;
    const held =
      pin.kind === "lock" ||
      (pin.kind === "snooze" && snoozeActive(pin, now)) ||
      (pin.kind === "skip" && pkg.availableVersion === pin.version);
    if (!held) return pkg; // přeskočená verze už není nejnovější, odložení vypršelo – aktualizace se nabídne
    return {
      ...pkg,
      availableVersion: null,
      heldVersion: pkg.availableVersion ?? undefined,
      pin: pin.kind,
      ...(pin.kind === "snooze" ? { pinUntil: pin.until } : {}),
    };
  });
}
