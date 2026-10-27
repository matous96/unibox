/**
 * Rozpoznání repozitáře na GitHubu z odkazů aplikace. Bez závislostí – používá
 * ho aplikace (services/github.ts) i datová pipeline (hvězdičky do katalogu).
 */

/** Stránky GitHubu, které nejsou repozitářem (github.com/orgs/…, /sponsors/…). */
export const NOT_OWNERS =/^(orgs|sponsors|apps|marketplace|features|topics|collections|settings|login)$/i;

/** „owner/repo“ (malými písmeny) z odkazů aplikace – repozitář, web, hlášení chyb – nebo null. */
export function githubRepoOf(entry: {
  repositoryUrl?: string | null;
  homepage?: string | null;
  issuesUrl?: string | null;
}): string | null {
  for (const url of [entry.repositoryUrl, entry.homepage, entry.issuesUrl]) {
    const match = url?.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#]|$)/i);
    if (match && !NOT_OWNERS.test(match[1])) return `${match[1]}/${match[2]}`.toLowerCase();
  }
  return null;
}
