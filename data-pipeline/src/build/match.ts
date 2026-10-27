/**
 * Párování balíčků napříč správci do jedné karty aplikace.
 *
 * Základem je winget. Balíček z Chocolatey / Scoopu se k balíčku wingetu
 * přiřadí podle signálů s různou váhou:
 *  - 100  shoda s „monikerem“ wingetu (krátké jméno: firefox, vscode, vlc),
 *   85  stejný název („Mozilla Firefox“ = „Mozilla Firefox (en-US)“),
 *   75  shoda s celým id wingetu („googlechrome“ = „Google.Chrome“),
 *   70  stejný název bez přívěsků („Signal Desktop“ = „Signal“, „Zoom Client“ = „Zoom“),
 *   60  shoda s poslední částí id („git“ = „Git.Git“).
 * Chocolatey a Scoop bez wingetu se párují podle id, názvu a webu aplikace.
 * Přiřazuje se hladově od nejsilnějších shod; každý balíček wingetu může mít
 * nejvýš jeden protějšek z každého správce. Co se nespáruje, je samostatná karta.
 */
import { wingetVariant } from "../../../src/lib/wingetVariant.ts";
import type { ChocoPackage } from "../sources/chocolatey.ts";
import type { ScoopPackage } from "../sources/scoop.ts";
import type { WingetIndexEntry } from "../sources/winget.ts";
import { cleanName, nameKey, normalize, siteKey, trimmedNameKey } from "../lib/text.ts";

export interface AppRecord {
  winget?: WingetIndexEntry;
  /** Varianty balíčku wingetu (jazyk, typ instalátoru) sloučené do této karty. */
  wingetVariants?: WingetIndexEntry[];
  choco?: ChocoPackage;
  scoop?: ScoopPackage;
}

interface Edge {
  /** Index balíčku v jeho zdroji. */
  from: number;
  /** Cíl (index balíčku wingetu, resp. záznamu Chocolatey). */
  to: number;
  score: number;
}

/** Index pro rychlé hledání podle klíče. */
function indexBy<T>(items: T[], keys: (item: T) => (string | null | undefined)[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  items.forEach((item, i) => {
    for (const key of new Set(keys(item))) {
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(i);
      else map.set(key, [i]);
    }
  });
  return map;
}

/** Hladové přiřazení: hrany od nejsilnější, každý zdroj i cíl nejvýš jednou. */
function assign(edges: Edge[]): Map<number, number> {
  edges.sort((a, b) => b.score - a.score);
  const usedFrom = new Set<number>();
  const usedTo = new Set<number>();
  const result = new Map<number, number>();
  for (const e of edges) {
    if (usedFrom.has(e.from) || usedTo.has(e.to)) continue;
    usedFrom.add(e.from);
    usedTo.add(e.to);
    result.set(e.from, e.to);
  }
  return result;
}

/**
 * Základní id a přípona varianty balíčku wingetu, nebo null:
 *  - jazyk („Mozilla.Firefox.cs“, „Mozilla.Firefox.en-GB“ → „Mozilla.Firefox“),
 *  - jiný typ instalátoru („Google.Chrome.EXE“, „Mozilla.Firefox.MSIX“,
 *    „KDE.Kate.appx“ → „Google.Chrome“, …).
 * Krátké přípony, které jazykem nejsou („.dev“, „.cli“, „.pro“…), jsou
 * samostatné balíčky. Stejné pravidlo používá aplikace (src/lib/wingetVariant.ts).
 */
export { wingetBaseId, wingetVariant } from "../../../src/lib/wingetVariant.ts";

/**
 * Varianty balíčku (jazyk, typ instalátoru) nedostanou vlastní kartu, pokud
 * existuje základní balíček – jinak by vznikly desítky karet stejné aplikace.
 * Do karty základního balíčku se připojí jako varianty (výběr ve volbách
 * instalace), takže katalog obsahuje všechny balíčky wingetu.
 */
export function dedupeWinget(entries: WingetIndexEntry[]): { entries: WingetIndexEntry[]; variants: Map<string, WingetIndexEntry[]> } {
  const ids = new Set(entries.map((e) => e.id.toLowerCase()));
  const variants = new Map<string, WingetIndexEntry[]>();
  const kept = entries.filter((e) => {
    const variant = wingetVariant(e.id);
    if (!variant || !ids.has(variant.base.toLowerCase())) return true;
    const key = variant.base.toLowerCase();
    variants.set(key, [...(variants.get(key) ?? []), e]);
    return false;
  });
  return { entries: kept, variants };
}

/** Pomocné balíčky Chocolatey, které nejsou aplikacemi (rozšíření, šablony). */
const isChocoHelper = (id: string) => /\.(extension|template)$/i.test(id) || /^chocolatey-/i.test(id);

/**
 * Chocolatey má často trojici „app“ (meta), „app.install“ a „app.portable“.
 * Ponechá se základní balíček; varianta jen tehdy, když základní neexistuje.
 */
export function dedupeChoco(packages: ChocoPackage[]): ChocoPackage[] {
  const ids = new Set(packages.map((p) => p.id.toLowerCase()));
  const kept = new Map<string, ChocoPackage>();
  for (const p of packages) {
    if (isChocoHelper(p.id)) continue;
    const base = p.id.toLowerCase().replace(/\.(install|portable)$/, "");
    if (base !== p.id.toLowerCase() && ids.has(base)) continue; // existuje základní balíček
    const existing = kept.get(base);
    // Z .install a .portable ponechat ten stahovanější
    if (!existing || p.downloadCount > existing.downloadCount) kept.set(base, p);
  }
  return [...kept.values()];
}

/** Scoop: stejná aplikace ve více bucketech → první podle pořadí bucketů (main > extras > …). */
export function dedupeScoop(packages: ScoopPackage[]): ScoopPackage[] {
  const kept = new Map<string, ScoopPackage>();
  for (const p of packages) if (!kept.has(p.name.toLowerCase())) kept.set(p.name.toLowerCase(), p);
  return [...kept.values()];
}

const chocoBase = (id: string) => id.toLowerCase().replace(/\.(install|portable)$/, "");
const idTail = (id: string) => id.split(".").pop() ?? id;

export function pairSources(
  winget: WingetIndexEntry[],
  chocoAll: ChocoPackage[],
  scoopAll: ScoopPackage[],
  variants: Map<string, WingetIndexEntry[]> = new Map(),
): AppRecord[] {
  const choco = dedupeChoco(chocoAll);
  const scoop = dedupeScoop(scoopAll);

  // Indexy wingetu podle jednotlivých signálů
  const byMoniker = indexBy(winget, (w) => [w.moniker?.toLowerCase()]);
  const byName = indexBy(winget, (w) => [nameKey(cleanName(w.name))]);
  const byId = indexBy(winget, (w) => [nameKey(w.id)]);
  const byTrimmed = indexBy(winget, (w) => [trimmedNameKey(w.name)]);
  const byTail = indexBy(winget, (w) => [nameKey(idTail(w.id))]);

  /** Kandidáti z wingetu pro daný klíč a jejich skóre. */
  const candidates = (keys: { key: string | null; map: Map<string, number[]>; score: number }[], publisherHint?: string) => {
    const best = new Map<number, number>();
    for (const { key, map, score } of keys) {
      if (!key) continue;
      for (const i of map.get(key) ?? []) {
        // Drobný bonus, když sedí i vydavatel (rozhodne mezi stejně pojmenovanými balíčky)
        const bonus = publisherHint && winget[i].publisherNorm && publisherHint.includes(winget[i].publisherNorm!) ? 5 : 0;
        // Kratší id = spíš hlavní balíček („Git.Git“ před „Git.Git.PreRelease“)
        const s = score + bonus - winget[i].id.length / 100;
        if ((best.get(i) ?? 0) < s) best.set(i, s);
      }
    }
    return best;
  };

  // Chocolatey → winget
  const chocoEdges: Edge[] = [];
  choco.forEach((c, from) => {
    const base = chocoBase(c.id);
    const found = candidates(
      [
        { key: base, map: byMoniker, score: 100 },
        { key: nameKey(c.title), map: byName, score: 85 },
        { key: nameKey(base), map: byId, score: 75 },
        { key: trimmedNameKey(c.title), map: byTrimmed, score: 70 },
        { key: nameKey(base), map: byTail, score: 60 },
      ],
      normalize(c.authors),
    );
    for (const [to, score] of found) chocoEdges.push({ from, to, score });
  });
  const chocoToWinget = assign(chocoEdges);

  // Scoop → winget
  const scoopEdges: Edge[] = [];
  scoop.forEach((s, from) => {
    const name = s.name.toLowerCase();
    const found = candidates([
      { key: name, map: byMoniker, score: 100 },
      { key: nameKey(name), map: byName, score: 85 },
      { key: nameKey(name), map: byId, score: 75 },
      { key: trimmedNameKey(name), map: byTrimmed, score: 70 },
      { key: nameKey(name), map: byTail, score: 60 },
    ]);
    for (const [to, score] of found) scoopEdges.push({ from, to, score });
  });
  const scoopToWinget = assign(scoopEdges);

  // Záznamy s wingetem (i s jeho variantami – jazyky, typy instalátoru)
  const records: AppRecord[] = winget.map((w) => {
    const merged = variants.get(w.id.toLowerCase());
    return merged ? { winget: w, wingetVariants: merged } : { winget: w };
  });
  for (const [c, w] of chocoToWinget) records[w].choco = choco[c];
  for (const [s, w] of scoopToWinget) records[w].scoop = scoop[s];

  // Chocolatey bez wingetu → samostatné záznamy; k nim ještě zkusit Scoop
  const chocoOnly = choco.filter((_, i) => !chocoToWinget.has(i));
  const chocoOnlyStart = records.length;
  for (const c of chocoOnly) records.push({ choco: c });

  const byChocoId = indexBy(chocoOnly, (c) => [chocoBase(c.id)]);
  const byChocoTitle = indexBy(chocoOnly, (c) => [nameKey(c.title), nameKey(chocoBase(c.id)), trimmedNameKey(c.title)]);
  // Stejný web aplikace (u GitHubu včetně repozitáře) – „sharkdp/bat“ = „bat“
  const byChocoSite = indexBy(chocoOnly, (c) => [siteKey(c.projectUrl)]);
  const scoopChocoEdges: Edge[] = [];
  scoop.forEach((s, from) => {
    if (scoopToWinget.has(from)) return;
    for (const to of byChocoId.get(s.name.toLowerCase()) ?? []) scoopChocoEdges.push({ from, to, score: 90 });
    for (const to of byChocoTitle.get(nameKey(s.name)) ?? []) scoopChocoEdges.push({ from, to, score: 80 });
    const site = siteKey(s.homepage);
    // Jen weby konkrétní aplikace (repozitář), ne společné domény vydavatelů
    if (site && site.split("/").length === 3) for (const to of byChocoSite.get(site) ?? []) scoopChocoEdges.push({ from, to, score: 70 });
  });
  const scoopToChoco = assign(scoopChocoEdges);
  for (const [s, c] of scoopToChoco) records[chocoOnlyStart + c].scoop = scoop[s];

  // Scoop bez protějšku
  scoop.forEach((s, i) => {
    if (!scoopToWinget.has(i) && !scoopToChoco.has(i)) records.push({ scoop: s });
  });

  return records;
}
