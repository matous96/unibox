import clsx, { type ClassValue } from "clsx";

/** Spojení CSS tříd s podmínkami. */
export const cn = (...inputs: ClassValue[]) => clsx(inputs);

/** Deterministický hash řetězce (pro barvu zástupné ikony). */
export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Dvojice barev pro gradient zástupné ikony – stejné id = stejná barva. */
export function placeholderColors(id: string): [string, string] {
  const hue = hashString(id) % 360;
  return [`hsl(${hue} 70% 55%)`, `hsl(${(hue + 35) % 360} 75% 42%)`];
}

/** První „smysluplné“ písmeno názvu pro zástupnou ikonu. */
export function initialOf(name: string): string {
  const match = name.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? "?").toUpperCase();
}

/**
 * Velikost souboru rozdělená na číslo a jednotku pro pruh s údaji
 * („182,9“ + „MB“). Používá binární násobky jako Windows (1 MB = 1024 KB).
 */
export function formatSize(bytes: number, locale: string): { value: string; unit: string } {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const digits = value < 10 && i > 0 ? 1 : value < 100 ? 1 : 0;
  return { value: value.toLocaleString(locale, { maximumFractionDigits: digits }), unit: units[i] };
}

/** Počet aplikací přesně, jak je v načteném katalogu („25 148“). */
export function formatAppCount(n: number, locale: string): string {
  return n.toLocaleString(locale);
}

/**
 * Počet pro úzká místa (levý panel, karty): do 100 000 přesně („15 725“),
 * větší čísla zkráceně („3,5 mil.“, „650 tis.“ / „3.5M“).
 */
export function formatCompactCount(n: number, locale: string): string {
  if (n < 100_000) return formatAppCount(n, locale);
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * Prvních `n` položek s nejvyšším skóre – jeden průchod místo řazení celého
 * seznamu (katalog má desítky tisíc aplikací); skóre se spočítá pro každou
 * položku jen jednou. Při shodě má přednost dřívější položka (jako stabilní sort).
 */
export function topN<T>(items: readonly T[], n: number, score: (item: T) => number): T[] {
  const top: { item: T; score: number }[] = [];
  for (const item of items) {
    const value = score(item);
    if (top.length === n && !(value > top[n - 1].score)) continue;
    let i = top.length;
    while (i > 0 && value > top[i - 1].score) i--;
    top.splice(i, 0, { item, score: value });
    if (top.length > n) top.pop();
  }
  return top.map((entry) => entry.item);
}

/** Velikost souboru jako jeden text („182,9 MB“). */
export function formatSizeText(bytes: number, locale: string): string {
  const { value, unit } = formatSize(bytes, locale);
  return `${value} ${unit}`;
}

/** Relativní čas („před 3 dny“) v daném jazyce. */
export function formatRelative(iso: string, locale: string): string {
  const diffSec = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSec) >= seconds) return rtf.format(Math.round(diffSec / seconds), unit);
  }
  return rtf.format(0, "minute");
}

/** Odstranění diakritiky a převod na malá písmena – pro vyhledávání. */
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
