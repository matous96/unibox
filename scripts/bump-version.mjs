// Zvýší verzi HubGetu o jedna (0.1.0 → 0.1.1 → 0.1.2 …) ve všech třech
// místech najednou: src-tauri/tauri.conf.json (verze instalátoru a aplikace),
// src-tauri/Cargo.toml a package.json. Každé sestavení instalátoru tak má
// vlastní číslo (Unibox_0.1.1_x64-setup.exe).
//
//   node scripts/bump-version.mjs          → další číslo (patch)
//   node scripts/bump-version.mjs 0.2.0    → konkrétní verze
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  tauri: join(root, "src-tauri", "tauri.conf.json"),
  cargo: join(root, "src-tauri", "Cargo.toml"),
  npm: join(root, "package.json"),
};

const tauriConfig = readFileSync(files.tauri, "utf8");
const current = tauriConfig.match(/"version":\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!current) throw new Error("Verze v tauri.conf.json nenalezena");

const requested = process.argv[2];
if (requested && !/^\d+\.\d+\.\d+$/.test(requested)) throw new Error(`Neplatná verze: ${requested}`);
const next = requested ?? `${current[1]}.${current[2]}.${Number(current[3]) + 1}`;

// Jen první výskyt (verze balíčku), ne verze závislostí
const replaceFirst = (file, pattern, replacement) => {
  const text = readFileSync(file, "utf8");
  if (!pattern.test(text)) throw new Error(`Verze v ${file} nenalezena`);
  writeFileSync(file, text.replace(pattern, replacement));
};
replaceFirst(files.tauri, /"version":\s*"\d+\.\d+\.\d+"/, `"version": "${next}"`);
replaceFirst(files.cargo, /^version = "\d+\.\d+\.\d+"/m, `version = "${next}"`);
replaceFirst(files.npm, /"version":\s*"\d+\.\d+\.\d+"/, `"version": "${next}"`);

console.log(`HubGet ${current[1]}.${current[2]}.${current[3]} → ${next}`);
