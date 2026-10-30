// latest.json – soubor, podle kterého nainstalované HubGet poznají novou verzi
// (plugin updater). Podpis (.sig) se počítá z hotového – i digitálně podepsaného –
// instalátoru NSIS. Používá ho místní vydání (scripts/release.mjs) i sestavení
// v GitHub Actions (.github/workflows/release.yml):
//   node scripts/updater-manifest.mjs [--notes "Co je nového"]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Zapíše latest.json vedle instalátoru NSIS a vrátí cestu k instalátoru i manifestu. */
export function writeUpdaterManifest(notes) {
  const config = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  const version = config.version;
  const bundle = join(root, "src-tauri", "target", "release", "bundle", "nsis");
  // Instalátor nese název aplikace v době vydání (do 0.1.18 Unibox_…) – u nového podpisu starší verze jiný
  const named = `${config.productName}_${version}_x64-setup.exe`;
  const installer = existsSync(join(bundle, `${named}.sig`))
    ? named
    : (readdirSync(bundle).find((f) => f.endsWith(`_${version}_x64-setup.exe.sig`))?.replace(/.sig$/, "") ?? named);
  const signature = readFileSync(join(bundle, `${installer}.sig`), "utf8").trim();
  // Adresa ke stažení podle endpointu: …/releases/latest/download/latest.json → …/releases/download/v<verze>/<instalátor>
  const endpoint = config.plugins?.updater?.endpoints?.[0] ?? "";
  const releases = endpoint.replace(/\/releases\/latest\/download\/latest\.json$/, "/releases/download");
  const manifest = {
    version,
    notes: notes ?? `HubGet ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": { signature, url: `${releases}/v${version}/${installer}` },
    },
  };
  const file = join(bundle, "latest.json");
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  return { version, bundle, installer, file, endpoint };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--notes");
  const { file } = writeUpdaterManifest(i > 0 ? process.argv[i + 1] : undefined);
  console.log(`latest.json: ${file}`);
}
