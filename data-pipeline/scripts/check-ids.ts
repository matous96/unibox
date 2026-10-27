// Ověří, že aplikace zmíněné v redakčním obsahu (příběhy, kolekce) jsou ve vygenerovaném katalogu.
// Spuštění: node data-pipeline/scripts/check-ids.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Catalog } from "../../src/types/index.ts";
import { OUT_DIR, ROOT_DIR } from "../src/config.ts";

const catalog = JSON.parse(await readFile(join(OUT_DIR, "catalog.json"), "utf8")) as Catalog;
const ids = new Set(catalog.packages.map((p) => p.id));
const editorial = await readFile(join(ROOT_DIR, "src", "data", "editorial.ts"), "utf8");
const referenced = [...new Set([...editorial.matchAll(/"([a-z0-9]+(?:-[a-z0-9]+)+)"/g)].map((m) => m[1]))];
const missing = referenced.filter((id) => !ids.has(id) && !/^(profile|new-pc|focus|dev-setup|obsidian-tips|blender-studio|powertoys-gems|obs-first-stream)/.test(id));
console.log(`odkazů: ${referenced.length}, chybí v katalogu: ${missing.length}`);
for (const id of missing) {
  const tail = id.split("-").pop()!;
  const guesses = catalog.packages.filter((p) => p.id.includes(tail)).slice(0, 5).map((p) => p.id);
  console.log(`  ${id}  → podobné: ${guesses.join(", ")}`);
}
