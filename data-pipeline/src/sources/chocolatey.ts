/**
 * Zdroj Chocolatey: veřejné API Chocolatey Community Repository (NuGet v2,
 * OData / Atom XML). Prochází se po stránkách s pauzou mezi požadavky
 * (server má limity) a stránky se drží v mezipaměti zhruba den.
 */
import { CHOCOLATEY_FEED, MAX_AGE } from "../config.ts";
import { cachedFetch, Limiter } from "../lib/http.ts";
import { descriptionImages } from "../lib/images.ts";
import { log } from "../lib/log.ts";
import { decodeXml } from "../lib/text.ts";

export interface ChocoPackage {
  id: string;
  title: string;
  version: string;
  summary: string;
  iconUrl: string | null;
  projectUrl: string | null;
  tags: string[];
  downloadCount: number;
  authors: string;
  /** Datum vydání této verze (ISO). */
  published: string | null;
  sourceUrl: string | null;
  docsUrl: string | null;
  bugTrackerUrl: string | null;
  /** Screenshoty vložené do popisu balíčku (Markdown). */
  screenshots: string[];
}

/** První odstavec popisu bez Markdownu (Chocolatey často nemá Summary). */
function firstParagraph(markdown: string | null): string {
  if (!markdown) return "";
  const paragraph = markdown.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#")) ?? "";
  return paragraph
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // obrázky
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // odkazy → text
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jedna stránka najednou, s pauzou – Chocolatey při rychlém dotazování vrací 429. */
const chocoLimiter = new Limiter(1, 400);
const PAGE = 100;

/** Hodnota vlastnosti z <m:properties> (<d:Název …>hodnota</d:Název>). */
function prop(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<d:${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</d:${name}>)`));
  if (!match || match[1] === undefined) return null;
  return decodeXml(match[1]).trim() || null;
}

function parseEntry(entry: string): ChocoPackage | null {
  const id = entry.match(/<title type="text">([^<]+)<\/title>/)?.[1];
  const props = entry.match(/<m:properties[\s\S]*<\/m:properties>/)?.[0];
  if (!id || !props) return null;
  const description = prop(props, "Description");
  return {
    id: decodeXml(id),
    title: prop(props, "Title") ?? decodeXml(id),
    version: prop(props, "Version") ?? "",
    summary: prop(props, "Summary") ?? firstParagraph(description),
    iconUrl: prop(props, "IconUrl"),
    projectUrl: prop(props, "ProjectUrl"),
    tags: (prop(props, "Tags") ?? "").split(/\s+/).filter(Boolean).map((t) => t.toLowerCase()),
    downloadCount: Number(prop(props, "DownloadCount") ?? 0),
    authors: decodeXml(entry.match(/<author>\s*<name>([^<]*)<\/name>/)?.[1] ?? ""),
    published: prop(props, "Published"),
    sourceUrl: prop(props, "ProjectSourceUrl"),
    docsUrl: prop(props, "DocsUrl"),
    bugTrackerUrl: prop(props, "BugTrackerUrl"),
    screenshots: descriptionImages(description),
  };
}

export async function loadChocolatey(): Promise<{ packages: ChocoPackage[]; total: number }> {
  const packages: ChocoPackage[] = [];
  // Řazení podle Id = stabilní stránkování (nové balíčky neposunou celé pořadí)
  let url: string | null = `${CHOCOLATEY_FEED}?$filter=IsLatestVersion&$orderby=Id&$top=${PAGE}`;
  let pages = 0;
  while (url) {
    const res = await cachedFetch(url, { maxAge: MAX_AGE.chocolatey, limiter: chocoLimiter });
    if (res.status !== 200) {
      log.warn(`Chocolatey: ${res.status} – stránkování ukončeno`);
      break;
    }
    const xml = res.body.toString("utf8");
    const entries = xml.split("<entry>").slice(1);
    for (const entry of entries) {
      const pkg = parseEntry(entry);
      if (pkg) packages.push(pkg);
    }
    pages++;
    if (pages % 20 === 0) log.info(`Chocolatey: ${packages.length} balíčků…`);
    // Další stránka: odkaz „next“ od serveru, jinak ručně přes $skip
    const next = xml.match(/<link rel="next" href="([^"]+)"/)?.[1];
    url = next
      ? decodeXml(next).replace(/^(?!https?:)/, "https://community.chocolatey.org/api/v2/")
      : entries.length === PAGE
        ? `${CHOCOLATEY_FEED}?$filter=IsLatestVersion&$orderby=Id&$top=${PAGE}&$skip=${pages * PAGE}`
        : null;
  }
  log.info(`Chocolatey: ${packages.length} balíčků (${pages} stránek)`);
  return { packages, total: packages.length };
}
