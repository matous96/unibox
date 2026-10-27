/**
 * Statistika párování napříč správci (z mezipaměti pipeline): kolik karet má
 * winget + Chocolatey / Scoop a kolik párů přinesly jen novější signály –
 * název bez přívěsků („Signal Desktop“ = „Signal“) a web aplikace u Scoopu
 * a Chocolatey bez wingetu.
 *
 * Spuštění: node data-pipeline/scripts/pairing-stats.ts
 */
import { dedupeWinget, pairSources } from "../src/build/match.ts";
import { cleanName, nameKey, siteKey, trimmedNameKey } from "../src/lib/text.ts";
import { loadChocolatey } from "../src/sources/chocolatey.ts";
import { loadScoopBuckets } from "../src/sources/scoop.ts";
import { loadWingetIndex } from "../src/sources/winget.ts";

const { entries: winget, variants } = dedupeWinget(await loadWingetIndex());
const choco = await loadChocolatey();
const scoop = await loadScoopBuckets();
const records = pairSources(winget, choco.packages, scoop.packages, variants);

const tail = (id: string) => nameKey(id.split(".").pop() ?? id);
const oldSignals = (w: (typeof winget)[number], keys: string[]) =>
  keys.some((k) => k && (k === w.moniker?.toLowerCase() || k === nameKey(cleanName(w.name)) || k === nameKey(w.id) || k === tail(w.id)));

let trimmedChoco = 0;
let trimmedScoop = 0;
let siteOnly = 0;
const examples: string[] = [];
for (const r of records) {
  if (r.winget && r.choco) {
    const base = r.choco.id.toLowerCase().replace(/\.(install|portable)$/, "");
    if (!oldSignals(r.winget, [base, nameKey(r.choco.title), nameKey(base)])) {
      trimmedChoco++;
      examples.push(`choco „${r.choco.title}“ (${r.choco.id}) → winget „${r.winget.name}“ (${r.winget.id})`);
    }
  }
  if (r.winget && r.scoop) {
    const name = r.scoop.name.toLowerCase();
    if (!oldSignals(r.winget, [name, nameKey(name)])) {
      trimmedScoop++;
      examples.push(`scoop ${r.scoop.bucket}/${r.scoop.name} → winget „${r.winget.name}“ (${r.winget.id})`);
    }
  }
  if (!r.winget && r.choco && r.scoop) {
    const byName = [nameKey(r.choco.title), r.choco.id.toLowerCase().replace(/\.(install|portable)$/, ""), trimmedNameKey(r.choco.title)];
    if (!byName.includes(r.scoop.name.toLowerCase()) && !byName.includes(nameKey(r.scoop.name)) && siteKey(r.choco.projectUrl) === siteKey(r.scoop.homepage)) siteOnly++;
  }
}

console.log(`karet: ${records.length}`);
console.log(`winget + Chocolatey: ${records.filter((r) => r.winget && r.choco).length} (z toho jen díky názvu bez přívěsků: ${trimmedChoco})`);
console.log(`winget + Scoop: ${records.filter((r) => r.winget && r.scoop).length} (z toho jen díky názvu bez přívěsků: ${trimmedScoop})`);
console.log(`Chocolatey + Scoop bez wingetu: ${records.filter((r) => !r.winget && r.choco && r.scoop).length} (z toho jen podle webu: ${siteOnly})`);
console.log(`variant wingetu u karet: ${[...variants.values()].reduce((n, v) => n + v.length, 0)}`);
if (process.argv.includes("--examples")) for (const line of examples) console.log(`  ${line}`);
