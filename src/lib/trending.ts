import type { CatalogEntry } from "@/types";

/**
 * „Trendy“ = populární aplikace s čerstvou aktualizací: popularita
 * snížená podle stáří poslední verze (poločas zhruba měsíc). Používá ho
 * záložka Trendy na Domů a Nejstahovanější, dokud katalog nemá „Skokany týdne“.
 */
export function trendingScore(p: CatalogEntry, now: number): number {
  const ageDays = p.releaseDate ? (now - Date.parse(p.releaseDate)) / 86_400_000 : 365;
  return p.popularity * Math.pow(0.5, Math.max(ageDays, 0) / 30) + (p.featured ? 10 : 0);
}
