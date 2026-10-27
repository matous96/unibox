/**
 * Počty balíčků v registrech pro vývojáře (npm, PyPI, crates.io, NuGet,
 * PowerShell Gallery, vcpkg) – jen pro statistiky. Když registr neodpoví,
 * použije se předchozí hodnota z mezipaměti, případně odhad.
 */
import { FALLBACK_COUNTS, MAX_AGE } from "../config.ts";
import { fetchJson, fetchText } from "../lib/http.ts";
import { log } from "../lib/log.ts";
import type { SourceId } from "../../../src/types/index.ts";

type Counts = Partial<Record<SourceId, number>>;

async function safe(label: string, task: () => Promise<number>): Promise<number | undefined> {
  try {
    const n = await task();
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch (error) {
    log.warn(`${label}: ${(error as Error).message}`);
    return undefined;
  }
}

const opts = { maxAge: MAX_AGE.registries };

export async function loadRegistryCounts(): Promise<Counts> {
  const [npm, crates, nuget, psgallery, vcpkg] = await Promise.all([
    safe("npm", async () => (await fetchJson<{ doc_count: number }>("https://replicate.npmjs.com/", opts)).doc_count),
    safe("crates.io", async () => (await fetchJson<{ num_crates: number }>("https://crates.io/api/v1/summary", opts)).num_crates),
    safe("NuGet", async () =>
      (await fetchJson<{ totalHits: number }>("https://azuresearch-usnc.nuget.org/query?packageType=DotnetTool&take=0", opts)).totalHits,
    ),
    safe("PowerShell Gallery", async () =>
      Number(await fetchText("https://www.powershellgallery.com/api/v2/Packages()/$count?$filter=IsLatestVersion", opts)),
    ),
    // vcpkg: počet portů = počet složek v ports/ (GitHub API, s mezipamětí kvůli limitu 60 požadavků/h)
    safe("vcpkg", async () => {
      const root = await fetchJson<{ tree: { path: string; sha: string }[] }>(
        "https://api.github.com/repos/microsoft/vcpkg/git/trees/master",
        opts,
      );
      const ports = root.tree.find((t) => t.path === "ports");
      if (!ports) return 0;
      const tree = await fetchJson<{ tree: unknown[] }>(`https://api.github.com/repos/microsoft/vcpkg/git/trees/${ports.sha}`, opts);
      return tree.tree.length;
    }),
  ]);

  const pypi = Number(process.env.PYPI_COUNT) || FALLBACK_COUNTS.pypi;
  return {
    npm,
    bun: npm, // Bun instaluje z registru npm
    pip: pypi,
    cargo: crates,
    dotnet: nuget,
    pwsh: psgallery,
    powershell: psgallery,
    vcpkg,
  };
}
