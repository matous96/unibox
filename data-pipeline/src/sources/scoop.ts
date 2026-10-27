/**
 * Zdroj Scoop: manifesty aplikací (JSON) z bucketů na GitHubu. Každý bucket
 * se stáhne jako jeden archiv tar.gz (codeload, bez limitů API) a jen při
 * změně (ETag).
 */
import { MAX_AGE, SCOOP_BUCKETS } from "../config.ts";
import { readTarGz } from "../lib/archive.ts";
import { cachedFetch } from "../lib/http.ts";
import { log } from "../lib/log.ts";

export interface ScoopPackage {
  bucket: string;
  /** Název aplikace = název souboru manifestu („firefox“). */
  name: string;
  version: string;
  description: string;
  homepage: string | null;
  license: string | null;
  architectures: ("x64" | "x86" | "arm64")[];
  sha256: string | null;
}

interface ScoopManifest {
  version?: string;
  description?: string;
  homepage?: string;
  license?: string | { identifier?: string };
  hash?: string | string[];
  architecture?: Record<string, { hash?: string | string[] }>;
}

const ARCH: Record<string, "x64" | "x86" | "arm64"> = { "64bit": "x64", "32bit": "x86", arm64: "arm64" };

/** Kontrolní součet ve tvaru Scoopu („sha256:…“ nebo jen hex) → SHA-256 velkými písmeny. */
function sha256Of(hash: string | string[] | undefined): string | null {
  const h = Array.isArray(hash) ? hash[0] : hash;
  if (!h) return null;
  const value = h.replace(/^sha256:/i, "");
  return /^[0-9a-f]{64}$/i.test(value) ? value.toUpperCase() : null;
}

export async function loadScoopBuckets(): Promise<{ packages: ScoopPackage[]; total: number }> {
  const packages: ScoopPackage[] = [];
  for (const bucket of SCOOP_BUCKETS) {
    const url = `https://codeload.github.com/${bucket.repo}/tar.gz/refs/heads/${bucket.branch}`;
    const res = await cachedFetch(url, { maxAge: MAX_AGE.scoop });
    if (res.status !== 200) {
      log.warn(`Scoop ${bucket.name}: ${res.status}`);
      continue;
    }
    let count = 0;
    for (const file of readTarGz(res.body)) {
      // Manifesty jsou v <repo>-<větev>/bucket/<název>.json
      const match = file.path.match(/\/bucket\/([^/]+)\.json$/);
      if (!match) continue;
      try {
        const m = JSON.parse(file.data.toString("utf8")) as ScoopManifest;
        if (!m.version) continue;
        const archKeys = Object.keys(m.architecture ?? {}).filter((k) => k in ARCH);
        packages.push({
          bucket: bucket.name,
          name: match[1],
          version: m.version,
          description: m.description ?? "",
          homepage: m.homepage ?? null,
          license: typeof m.license === "string" ? m.license : (m.license?.identifier ?? null),
          // Bez sekce architecture jde o balíček pro všechny architektury (typicky 64bit)
          architectures: archKeys.length ? archKeys.map((k) => ARCH[k]) : ["x64"],
          sha256: sha256Of(m.architecture?.["64bit"]?.hash ?? m.hash ?? Object.values(m.architecture ?? {})[0]?.hash),
        });
        count++;
      } catch {
        // Poškozený manifest – přeskočit
      }
    }
    log.info(`Scoop ${bucket.name}: ${count} aplikací ${res.fromCache ? "(beze změny)" : "(staženo)"}`);
  }
  return { packages, total: packages.length };
}
