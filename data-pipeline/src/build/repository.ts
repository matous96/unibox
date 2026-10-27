/**
 * Výběr repozitáře aplikace z odkazů ve wingetu, Scoopu a Chocolatey.
 *
 * Odkazy si často odporují: Chocolatey mívá zastaralý zdroj (OBS Studio →
 * jp9000/OBS místo obsproject/obs-studio), winget odkazuje na repozitář
 * s instalátory (vim/vim-win32-installer) a metadata komunitních balíčků
 * občas na repozitář samotného balíčku (…/chocolatey-packages). Každý odkaz
 * proto dá svému repozitáři body podle spolehlivosti pole – winget se
 * aktualizuje s každou verzí, metadata Chocolatey často léta ne:
 *  - pomocné repozitáře (instalátory, buildy, web, hlášení chyb) dostanou jen
 *    zlomek bodů; má-li stejný vlastník i hlavní repozitář, body připadnou jemu,
 *  - repozitáře balíčků správců body nedostanou (vyhrají, jen když nic jiného není),
 *  - vyhraje nejvíc bodů, při shodě spolehlivější pole.
 */
import { NOT_OWNERS } from "../../../src/lib/github.ts";
import { isRepositoryUrl } from "../lib/text.ts";

export interface RepositoryLink {
  url: string | null | undefined;
  weight: number;
  /**
   * Které repozitáře smí odkaz zavést mezi kandidáty (ostatním jen přidá body):
   * any = jakýkoli (výchozí), main = jen hlavní, ne pomocný (poznámky k vydání),
   * none = žádný (web ze spárovaného balíčku jiného správce – párování se může splést).
   */
  introduces?: "any" | "main" | "none";
}

/** Váhy polí – jak spolehlivě odkaz vede na aktuální repozitář aplikace. */
export const LINK_WEIGHT = {
  wingetPackage: 3,
  wingetReleaseNotes: 3,
  wingetSupport: 2,
  scoopHomepage: 2,
  chocoSource: 1.5,
  wingetPublisher: 1,
  chocoProject: 1,
  chocoBugTracker: 1,
};

/** Pomocné repozitáře: instalátory, buildy pro Windows, web, dokumentace, hlášení chyb. */
const AUXILIARY =
  /(^|[-_.])(installers?|setup|builds?|binaries|bin|releases?|dist|downloads?|win32|win64|windows|win|winget|website|site|docs?|documentation|issues|bugs?|feedback|packages)($|[-_.])|\.github\.io$/i;
const AUXILIARY_OWNER = /-releases$/i;
const AUXILIARY_FACTOR = 0.25;

/** Repozitáře balíčků správců (Chocolatey, Homebrew, Scoop, winget-pkgs) – o aplikaci nic neříkají. */
const PACKAGING = /chocolatey|(^|[-_.])choco($|[-_.])|^homebrew-|(^|[-_.])scoop($|[-_.])|^winget-pkgs$/i;
/** …kromě samotných správců balíčků (chocolatey/choco, ScoopInstaller/Scoop). */
const PACKAGE_MANAGER_APP = /chocolatey|scoop|winget|homebrew/i;

interface Repository {
  key: string;
  url: string;
  /** host/vlastník malými písmeny – pomocný repozitář předá body hlavnímu. */
  ownerKey: string;
  name: string;
  owner: string;
}

interface Candidate {
  url: string;
  ownerKey: string;
  kind: "main" | "auxiliary" | "packaging";
  /** Součet vah odkazů bez srážky za pomocný repozitář. */
  weight: number;
  order: number;
  eligible: boolean;
}

/** Repozitář (GitHub, GitLab, Codeberg) z libovolné jeho stránky, nebo null. */
function repositoryOf(url: string | null | undefined): Repository | null {
  if (!url || !isRepositoryUrl(url)) return null;
  const parsed = new URL(url.trim());
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const [owner, rawName] = parsed.pathname.split("/").filter(Boolean);
  if (host === "github.com" && NOT_OWNERS.test(owner)) return null;
  const name = rawName.replace(/\.git$/i, "");
  return {
    key: `${host}/${owner}/${name}`.toLowerCase(),
    url: `https://${host}/${owner}/${name}`,
    ownerKey: `${host}/${owner}`.toLowerCase(),
    owner,
    name,
  };
}

const score = (c: Candidate) => (c.kind === "main" ? c.weight : c.kind === "auxiliary" ? c.weight * AUXILIARY_FACTOR : 0);

/** Adresa repozitáře aplikace podle odkazů (seřazených od nejspolehlivějšího), nebo null. */
export function pickRepository(links: RepositoryLink[], appName: string): string | null {
  const candidates = new Map<string, Candidate>();
  links.forEach(({ url, weight, introduces = "any" }, order) => {
    const repo = repositoryOf(url);
    if (!repo) return;
    const kind =
      PACKAGING.test(repo.name) && !PACKAGE_MANAGER_APP.test(appName)
        ? "packaging"
        : AUXILIARY.test(repo.name) || AUXILIARY_OWNER.test(repo.owner)
          ? "auxiliary"
          : "main";
    const candidate = candidates.get(repo.key) ?? { url: repo.url, ownerKey: repo.ownerKey, kind, weight: 0, order, eligible: false };
    candidate.weight += weight;
    candidate.eligible ||= introduces === "any" || (introduces === "main" && kind === "main");
    candidates.set(repo.key, candidate);
  });

  const eligible = [...candidates.values()].filter((c) => c.eligible);
  // Pomocný repozitář (vim-win32-installer, Thorium-Win) podpoří hlavní repozitář stejného vlastníka
  for (const aux of eligible.filter((c) => c.kind === "auxiliary")) {
    const main = eligible
      .filter((c) => c.kind === "main" && c.ownerKey === aux.ownerKey)
      .sort((a, b) => b.weight - a.weight || a.order - b.order)[0];
    if (main) {
      main.weight += aux.weight;
      aux.eligible = false;
    }
  }
  const best = eligible.filter((c) => c.eligible).sort((a, b) => score(b) - score(a) || a.order - b.order)[0];
  return best?.url ?? null;
}

/** host/vlastník/repozitář malými písmeny – pro porovnání odkazů. */
export const repositoryKey = (url: string | null | undefined) => repositoryOf(url)?.key ?? null;
