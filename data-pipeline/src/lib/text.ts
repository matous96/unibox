/** Pomocné funkce pro práci s názvy, adresami a verzemi. */

/** Bez diakritiky a malými písmeny. */
export const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Klíč pro porovnání názvů – stejný jako v aplikaci (usePackages.nameKey):
 * „Spotify CLI“ = „Spotify Cli“, „spotify_player“ = „Spotify Player“.
 */
export const nameKey = (name: string) => normalize(name).replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Název z indexu wingetu bez přívěsků, které jsou jen variantou téže aplikace:
 * „Mozilla Firefox (en-US)“ → „Mozilla Firefox“, „Zoom (x64)“ → „Zoom“.
 */
export function cleanName(name: string): string {
  return name
    .replace(/\s*\((?:[a-z]{2,3}(?:-[A-Za-z]{2,4})?|x64|x86|arm64|64-?bit|32-?bit|machine|user)\)\s*$/i, "")
    .trim();
}

/** Slova, která jsou jen přívěskem názvu téže aplikace („Signal Desktop“, „Zoom Client“). */
const NAME_NOISE = /\b(?:desktop|app|application|client|for windows|windows|portable|install|installer|setup)\b/g;

/**
 * Klíč názvu bez přívěsků: „Signal Desktop“ = „Signal“, „Zoom Client“ = „Zoom“.
 * Prázdný nebo příliš krátký výsledek = null – krátká obecná slova („sdk“, „pet“)
 * by spárovala různé aplikace („windows-app-sdk“ ≠ „Windows SDK“).
 */
export function trimmedNameKey(name: string): string | null {
  const key = nameKey(normalize(cleanName(name)).replace(NAME_NOISE, " "));
  return key.length >= 4 ? key : null;
}

/**
 * Kanonické id aplikace z id wingetu: „Mozilla.Firefox“ → „mozilla-firefox“,
 * „Notepad++.Notepad++“ → „notepadplusplus-notepadplusplus“.
 */
export const slugId = (id: string) =>
  normalize(id)
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Vydavatel odhadnutý z id wingetu: „Mozilla.Firefox“ → „Mozilla“. */
export const publisherFromId = (id: string) => id.split(".")[0] ?? "";

/**
 * Klíč webu pro párování: doména bez „www.“; u GitHubu / GitLabu včetně
 * vlastníka a repozitáře („github.com/sharkdp/bat“), jinak by se shodovalo vše.
 */
export function siteKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "github.com" || host === "gitlab.com" || host === "codeberg.org") {
      const [owner, repo] = u.pathname.split("/").filter(Boolean);
      return owner ? `${host}/${owner.toLowerCase()}${repo ? `/${repo.toLowerCase().replace(/\.git$/, "")}` : ""}` : host;
    }
    return host;
  } catch {
    return null;
  }
}

/** Je adresa repozitář se zdrojovým kódem (GitHub, GitLab, Codeberg…)? */
export function isRepositoryUrl(url: string | null | undefined): boolean {
  const key = siteKey(url);
  return !!key && /^(github\.com|gitlab\.com|codeberg\.org)\/[^/]+\/[^/]+$/.test(key);
}

/**
 * Porovnání verzí („1.10.2“ > „1.9“, „2025.10.22“ > „2025.9.26“).
 * Číselné části se porovnávají jako čísla, ostatní jako text.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+_ ]/);
  const pb = b.split(/[.\-+_ ]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x.localeCompare(y);
    }
  }
  return 0;
}

/** Markdown → prostý text (bez obrázků, odkazy jen jako text, bez formátovacích znaků). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // obrázky
    .replace(/<img[^>]*>/gi, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](odkaz) → text
    .replace(/<[^>]+>/g, "") // HTML značky
    .replace(/^\s{0,3}#{1,6}\s*/gm, "") // nadpisy
    .replace(/^\s*[-*+]\s+/gm, "• ") // odrážky
    .replace(/[*_`~]{1,3}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Zkrácení textu na celé slovo s výpustkou. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.7)).replace(/[,;:.\s]+$/, "")}…`;
}

/** Dekódování entit v XML (&amp; &lt; &#228; …). */
export function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
