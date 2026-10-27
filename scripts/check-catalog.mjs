// Kontrola catalog.json před zveřejněním (workflow Katalog) a před přibalením
// k aplikaci (workflow Vydání): rozbitý nebo neúplný katalog by dostali všichni.
//   node scripts/check-catalog.mjs <catalog.json>
import { readFileSync } from "node:fs";

/** Méně aplikací znamená výpadek zdroje (celý katalog má přes 20 000). */
const MIN_PACKAGES = 10_000;

/** Vrátí popis chyby, nebo null, když je katalog v pořádku. */
function catalogProblem(catalog) {
  if (catalog?.schemaVersion !== 2) return `nepodporovaná verze schématu: ${catalog?.schemaVersion}`;
  if (!Array.isArray(catalog.packages)) return "chybí seznam aplikací";
  if (catalog.packages.length < MIN_PACKAGES) return `jen ${catalog.packages.length} aplikací (očekává se aspoň ${MIN_PACKAGES})`;
  return null;
}

const file = process.argv[2];
if (!file) {
  console.error("Použití: node scripts/check-catalog.mjs <catalog.json>");
  process.exit(2);
}
let catalog;
try {
  catalog = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Neplatný katalog ${file}: ${error.message}`);
  process.exit(1);
}
const problem = catalogProblem(catalog);
if (problem) {
  console.error(`Neplatný katalog ${file}: ${problem}`);
  process.exit(1);
}
console.log(`Katalog v pořádku: ${catalog.packages.length} aplikací, vygenerováno ${catalog.generatedAt}`);
