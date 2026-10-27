/**
 * Ikony, které deklaruje stránka (stejné hledání jako pipeline, bez mezipaměti) – ladění.
 *   node data-pipeline/scripts/probe-web-icons.ts <url…>
 */
import { discoverWebIcons } from "../src/build/icons.ts";

for (const url of process.argv.slice(2)) {
  console.log(url, "→", await discoverWebIcons(url).catch((error: Error) => [`chyba: ${error.message}`]));
}
