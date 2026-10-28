// Kolikrát se stáhly soubory vydání na GitHubu (veřejné počítadlo download_count):
// instalátor EXE a MSI a latest.json, který si stáhne každá kontrola aktualizací
// nainstalovaného Uniboxu (hrubý odhad, kolik kopií běží – není to počet lidí).
// GitHub ukazuje jen součet za celou dobu, bez toho, kdo a kdy stahoval; počítají se
// i vlastní stažení při testování. Koncepty vydání bez přihlášení vidět nejsou.
//
//   pnpm downloads              (volitelně GITHUB_TOKEN – vyšší limit dotazů API)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Repozitář podle adresy aktualizací (…github.com/<vlastník>/<repozitář>/releases/…)
const config = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const repo = /github\.com\/([^/]+\/[^/]+)\/releases/.exec(config.plugins?.updater?.endpoints?.[0] ?? "")?.[1];
if (!repo) throw new Error("Repozitář nenalezen v plugins.updater.endpoints (src-tauri/tauri.conf.json)");

const headers = { "User-Agent": "unibox-downloads", Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, { headers });
if (!response.ok) {
  const left = response.headers.get("x-ratelimit-remaining");
  throw new Error(`GitHub API: HTTP ${response.status}${left === "0" ? " – vyčerpaný limit dotazů, zkuste to za hodinu nebo s GITHUB_TOKEN" : ""}`);
}
const releases = (await response.json()).filter((r) => !r.draft);

/** Počet stažení přílohy podle konce názvu (0, když příloha chybí). */
const count = (release, suffix) => release.assets.filter((a) => a.name.endsWith(suffix)).reduce((sum, a) => sum + a.download_count, 0);
const rows = releases.map((r) => ({
  version: r.tag_name,
  date: new Date(r.published_at).toLocaleDateString("cs-CZ"),
  exe: count(r, "-setup.exe"),
  msi: count(r, ".msi"),
  checks: count(r, "latest.json"),
}));

const pad = (value, width) => String(value).padStart(width);
console.log(`Stažení vydání ${repo} (celkem za celou dobu, včetně vlastních testů)\n`);
console.log(`${"Verze".padEnd(10)} ${"Zveřejněno".padEnd(12)} ${pad("EXE", 6)} ${pad("MSI", 6)} ${pad("latest.json", 12)}`);
for (const row of rows) {
  console.log(`${row.version.padEnd(10)} ${row.date.padEnd(12)} ${pad(row.exe, 6)} ${pad(row.msi, 6)} ${pad(row.checks, 12)}`);
}
const total = (key) => rows.reduce((sum, row) => sum + row[key], 0);
console.log(`${"Celkem".padEnd(10)} ${"".padEnd(12)} ${pad(total("exe"), 6)} ${pad(total("msi"), 6)} ${pad(total("checks"), 12)}`);
console.log("\nlatest.json = kontroly aktualizací z nainstalovaných Uniboxů (hrubý odhad, kolik kopií běží).");
