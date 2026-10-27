/**
 * Rozlišení ikon v hotovém katalogu – kolik je ostrých, malých a nefunkčních,
 * podle zdroje. Měření sdílí mezipaměť s pipeline (.cache/icon-sizes.json).
 *   node data-pipeline/scripts/icon-report.ts [katalog.json] [--list]
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Catalog } from "../../src/types/index.ts";
import { iconPixels, measureIcons, MIN_ICON, SHARP_ICON } from "../src/build/icons.ts";
import { OUT_DIR } from "../src/config.ts";

const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join(OUT_DIR, "catalog.json");
const catalog = JSON.parse(await readFile(file, "utf8")) as Catalog;
const withIcon = catalog.packages.filter((p) => p.iconUrl);
const sizes = await measureIcons(withIcon.map((p) => p.iconUrl!));

const kindOf = (url: string) => {
  const u = new URL(url);
  if (u.hostname === "www.google.com") return "favicon Googlu";
  if (u.hostname === "cdn.winget.microsoft.com") return "manifest wingetu";
  if (/chocolatey|jsdelivr|githack|statically/.test(u.hostname)) return "Chocolatey / CDN";
  return "ostatní";
};
const buckets = (px: number) =>
  px === 0 ? "nefunkční" : px < MIN_ICON ? `< ${MIN_ICON}` : px < SHARP_ICON ? `${MIN_ICON}–${SHARP_ICON - 1}` : `≥ ${SHARP_ICON}`;
const table = new Map<string, Map<string, number>>();
for (const p of withIcon) {
  const kind = kindOf(p.iconUrl!);
  const bucket = buckets(iconPixels(sizes.get(p.iconUrl!)));
  const row = table.get(kind) ?? new Map<string, number>();
  row.set(bucket, (row.get(bucket) ?? 0) + 1);
  table.set(kind, row);
}
// „nefunkční“ zahrnuje i ikony, které při posledním měření nešlo načíst (výpadek serveru)
const columns = ["≥ " + SHARP_ICON, `${MIN_ICON}–${SHARP_ICON - 1}`, `< ${MIN_ICON}`, "nefunkční"];
console.log(`${withIcon.length} ikon z ${catalog.packages.length} aplikací`);
console.log(["zdroj".padEnd(18), ...columns.map((c) => c.padStart(10))].join(""));
for (const [kind, row] of table) console.log([kind.padEnd(18), ...columns.map((c) => String(row.get(c) ?? 0).padStart(10))].join(""));

// --list: populární aplikace bez ostré ikony (menší než SHARP_ICON, nefunkční nebo žádná)
if (process.argv.includes("--list")) {
  const notSharp = catalog.packages
    .filter((p) => !p.iconUrl || iconPixels(sizes.get(p.iconUrl)) < SHARP_ICON)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 60);
  console.log(`\nnejpopulárnější aplikace bez ostré ikony (< ${SHARP_ICON} px):`);
  for (const p of notSharp) {
    const s = p.iconUrl ? sizes.get(p.iconUrl) : null;
    const size = !p.iconUrl ? "bez ikony" : s === undefined ? "nezměřeno" : s ? `${s.width}×${s.height}` : "chyba";
    console.log(`${String(p.popularity).padStart(3)} ${p.id.padEnd(42).slice(0, 42)} ${size.padEnd(10)} ${p.homepage ?? ""}`);
  }
}
