// Vypíše vybraná pole manifestu wingetu (ladění převodu údajů).
// Spuštění: node data-pipeline/scripts/show-manifest.ts <id wingetu> [pole…]
import { loadWingetIndex, loadWingetManifest } from "../src/sources/winget.ts";

const [id, ...fields] = process.argv.slice(2);
const entry = (await loadWingetIndex()).find((e) => e.id === id);
if (!entry) throw new Error(`${id} ve wingetu není`);
const manifest = (await loadWingetManifest(entry)) as Record<string, unknown> | null;
for (const field of fields.length ? fields : Object.keys(manifest ?? {})) {
  console.log(`--- ${field}:\n${JSON.stringify(manifest?.[field], null, 1)?.slice(0, 1200)}`);
}
