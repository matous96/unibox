/**
 * Slučování dat účtu při synchronizaci mezi počítači (store/sync.ts).
 *
 * Každá oblast (předvolby, oblíbené, sada balíčků…) je plochý objekt
 * „klíč → hodnota“ (u oblíbených klíč = id aplikace). Slučuje se 3cestně:
 * základem je stav po poslední synchronizaci tohoto počítače, takže je
 * poznat, co se od té doby změnilo tady a co jinde:
 *  - co se tady přidalo nebo změnilo, platí (i proti změně jinde),
 *  - co se tady smazalo, zmizí – pokud to mezitím jinde nezměnili,
 *  - všechno ostatní se převezme z účtu (změny z jiných počítačů).
 * Při první synchronizaci (bez základu) se data spojí a u stejného klíče
 * vyhraje účet – předvolby z účtu přijdou na nový počítač, oblíbené
 * z obou stran zůstanou.
 */

export type SyncMap = Record<string, unknown>;

/** JSON se seřazenými klíči – porovnání hodnot nezávisle na pořadí klíčů. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export const sameValue = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

const has = (map: SyncMap, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/**
 * 3cestné sloučení: `base` = stav po poslední synchronizaci tohoto počítače
 * (null = první synchronizace), `local` = teď tady, `remote` = teď v účtu
 * (null = účet zatím nic nemá).
 */
export function mergeMaps(base: SyncMap | null, local: SyncMap, remote: SyncMap | null): SyncMap {
  if (!remote) return { ...local };
  if (!base) return { ...local, ...remote };

  const result: SyncMap = { ...remote };
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (has(local, key)) {
      // Přidané nebo změněné tady
      if (!has(base, key) || !sameValue(local[key], base[key])) result[key] = local[key];
    } else if (has(base, key)) {
      // Smazané tady – leda by to mezitím jinde změnili
      if (!has(remote, key) || sameValue(remote[key], base[key])) delete result[key];
    }
  }
  return result;
}
