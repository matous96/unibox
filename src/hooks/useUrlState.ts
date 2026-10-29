import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * Stav stránky v adrese (?klíč=hodnota) – filtr nebo řazení zůstane po otevření detailu
 * a návratu zpět (komponenta stránky se mezitím odpojí a obyčejný stav by zmizel).
 * Výchozí hodnota se do adresy nepíše; neplatná hodnota z adresy (`isValid`) = výchozí.
 * Ostatní parametry adresy zůstanou, záznam historie se nahradí (Zpět nepřechází filtry).
 */
export function useUrlState<T extends string>(key: string, fallback: T, isValid?: (value: string) => boolean): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw !== null && (!isValid || isValid(raw)) ? (raw as T) : fallback;

  const set = useCallback(
    (next: T) =>
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next === fallback) updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        { replace: true },
      ),
    [key, fallback, setParams],
  );
  return [value, set];
}
