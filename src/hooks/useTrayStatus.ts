/**
 * Stav operací pro ikonu v oznamovací oblasti (barevná tečka, tray.rs):
 *  - busy – ve frontě běží nebo čeká instalace / aktualizace / odinstalace (modrá),
 *  - error / done – výsledek poslední dávky operací (červená / zelená; selhání automatické
 *    aktualizace na pozadí se nepočítá – jde jen do historie). U aplikace
 *    se záložním zdrojem rozhoduje poslední pokus (WinGet selhal, Chocolatey
 *    nainstaloval = hotovo).
 * Výsledek zmizí, jakmile ho uživatel uvidí: okno v pozadí nebo schované
 * u hodin → při jeho otevření; okno, na které se právě dívá → po 10 s.
 */
import { useEffect, useRef, useState } from "react";
import { useAutoUpdates } from "@/store/autoUpdates";
import { useHistory } from "@/store/history";
import { useJobs } from "@/store/jobs";
import type { OperationOutcome } from "@/types";

export type TrayStatus = "idle" | "busy" | "error" | "done";

/** Jak dlouho výsledek zůstane, když se uživatel na okno dívá. */
const RESULT_VISIBLE_MS = 10_000;

export function useTrayStatus(): { status: TrayStatus; running: number; checking: boolean } {
  const running = useJobs((s) => Object.keys(s.jobs).length);
  // Kontrola aktualizací na pozadí (useAutoUpdates) – ikona je modrá i během ní
  const checking = useAutoUpdates((s) => s.checking);
  const [result, setResult] = useState<"error" | "done" | null>(null);
  /** Začátek právě běžící dávky operací (ISO), null = nic neběží. */
  const batchStart = useRef<string | null>(null);

  useEffect(() => {
    if (running > 0) {
      batchStart.current ??= new Date().toISOString();
      setResult(null);
      return;
    }
    const since = batchStart.current;
    if (!since) return;
    batchStart.current = null;
    // Poslední pokus každé aplikace z dávky (historie je od nejnovějšího záznamu)
    const outcomes = new Map<string, OperationOutcome>();
    for (const item of useHistory.getState().items) {
      if (item.finishedAt < since) break;
      // Selhání automatické aktualizace se na ikoně nehlásí – Unibox to zkusí příště
      if (item.background && item.outcome === "error") continue;
      if (!outcomes.has(item.appId)) outcomes.set(item.appId, item.outcome);
    }
    const values = [...outcomes.values()];
    // Jen zrušené operace žádný výsledek nehlásí
    setResult(values.includes("error") ? "error" : values.includes("success") ? "done" : null);
  }, [running]);

  useEffect(() => {
    if (!result) return;
    if (document.hasFocus()) {
      const timer = window.setTimeout(() => setResult(null), RESULT_VISIBLE_MS);
      return () => window.clearTimeout(timer);
    }
    const seen = () => setResult(null);
    window.addEventListener("focus", seen, { once: true });
    return () => window.removeEventListener("focus", seen);
  }, [result]);

  return { status: running > 0 || checking ? "busy" : (result ?? "idle"), running, checking };
}
