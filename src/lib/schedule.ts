/**
 * Plán úloh na pozadí (kontrola a instalace aktualizací, po vzoru UniGetUI):
 * v pevném intervalu od posledního spuštění, nebo každý den / ve vybrané dny
 * v zadaný čas. Čisté funkce – spouštění řídí hooks/useAutoUpdates.ts.
 */

export type Schedule =
  | { repeat: "interval"; intervalMs: number }
  | { repeat: "daily" | "days"; time: string; days: number[] };

/** „HH:MM“ → [hodiny, minuty] (neplatný čas = 10:00). */
function parseTime(time: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  const hours = match ? Number(match[1]) : 10;
  const minutes = match ? Number(match[2]) : 0;
  return hours < 24 && minutes < 60 ? [hours, minutes] : [10, 0];
}

/**
 * Termín, kdy má úloha naposledy proběhnout (ms), nebo null, když na řadě
 * není. `since` = poslední spuštění (nebo přeskočený termín), null = nikdy.
 */
export function dueTime(schedule: Schedule, since: number | null, now: number): number | null {
  if (schedule.repeat === "interval") {
    const next = since === null ? now : since + schedule.intervalMs;
    return next <= now ? next : null;
  }
  const [hours, minutes] = parseTime(schedule.time);
  // Poslední termín ≤ teď (nejvýš týden nazpět)
  for (let back = 0; back <= 7; back++) {
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    day.setHours(hours, minutes, 0, 0);
    const at = day.getTime();
    if (at > now) continue;
    if (schedule.repeat === "days" && !schedule.days.includes(day.getDay())) continue;
    return since === null || at > since ? at : null;
  }
  return null;
}

/** Příští termín po `now` (pro popisek „Příště …“), nebo null. */
export function nextTime(schedule: Schedule, since: number | null, now: number): number | null {
  if (schedule.repeat === "interval") return since === null ? now : Math.max(since + schedule.intervalMs, now);
  const [hours, minutes] = parseTime(schedule.time);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = new Date(now);
    day.setDate(day.getDate() + ahead);
    day.setHours(hours, minutes, 0, 0);
    if (day.getTime() <= now) continue;
    if (schedule.repeat === "days" && !schedule.days.includes(day.getDay())) continue;
    return day.getTime();
  }
  return null;
}
