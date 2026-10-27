// Kontrola vygenerovaného katalogu: statistiky, nejpopulárnější aplikace a vybrané karty.
// Spuštění: node data-pipeline/scripts/inspect-catalog.ts [id …]
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Catalog } from "../../src/types/index.ts";
import { OUT_DIR } from "../src/config.ts";

const catalog = JSON.parse(await readFile(join(OUT_DIR, "catalog.json"), "utf8")) as Catalog;
console.log("stats", catalog.stats);

const top = [...catalog.packages].sort((a, b) => b.popularity - a.popularity).slice(0, 25);
console.log("\nTOP 25:");
for (const p of top) {
  console.log(
    `${String(p.popularity).padStart(3)}  ${p.name.padEnd(34)} ${p.sources.map((s) => `${s.source}:${s.packageId}`).join("  ")}  [${p.categories.join(",")}] ${p.iconUrl ? "ikona" : "-"}`,
  );
}

const withIcon = catalog.packages.filter((p) => p.iconUrl).length;
const withCategory = catalog.packages.filter((p) => p.categories.length).length;
const withDescription = catalog.packages.filter((p) => p.description).length;
console.log(`\nikona ${withIcon} · kategorie ${withCategory} · popis ${withDescription} z ${catalog.packages.length}`);

for (const id of process.argv.slice(2)) {
  console.log(`\n${id}:`, JSON.stringify(catalog.packages.find((p) => p.id === id), null, 1)?.slice(0, 2500));
}
