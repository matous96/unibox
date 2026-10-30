// Ikony aplikace (src-tauri/icons) ze tří předloh loga:
//   assets/unibox-logo.svg        – s tenkým nápisem „hubget“ (velké ikony, 64 px a víc)
//   assets/unibox-logo-small.svg  – s výraznějším nápisem (24–48 px: hlavní panel, Alt+Tab)
//   assets/unibox-mark.svg        – bez nápisu (16 px a malé dlaždice, kde by byl jen šmouha)
// icon.ico se skládá ručně z PNG záznamů, protože `tauri icon` umí jen jednu předlohu.
//   node scripts/build-icons.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(root, "src-tauri", "icons");
const work = mkdtempSync(join(tmpdir(), "unibox-icons-"));
const tauriIcon = (...args) =>
  execFileSync(process.execPath, [join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"), "icon", ...args], { cwd: root, stdio: "pipe" });

const SOURCES = { text: "assets/unibox-logo.svg", small: "assets/unibox-logo-small.svg", mark: "assets/unibox-mark.svg" };
/** Záznamy v icon.ico: velikost → předloha. */
const ICO = [
  [16, "mark"],
  [24, "small"],
  [32, "small"],
  [48, "small"],
  [64, "text"],
  [256, "text"],
];
/** PNG v repozitáři z jiné předlohy než s tenkým nápisem. */
const PNG_SOURCE = { "32x32.png": "small", "Square30x30Logo.png": "mark", "Square44x44Logo.png": "small" };

try {
  for (const [name, source] of Object.entries(SOURCES)) {
    // Úplná sada PNG (Windows Store / MSIX, icon.png…) a velikosti pro ICO
    tauriIcon(source, "-o", join(work, name));
    const sizes = ICO.filter(([, from]) => from === name).flatMap(([size]) => ["-p", String(size)]);
    if (sizes.length) {
      mkdirSync(join(work, `${name}-ico`));
      tauriIcon(source, "-o", join(work, `${name}-ico`), ...sizes);
    }
  }

  // Soubory, které repozitář má a `tauri icon` je vytváří (ne ikony oznamovací oblasti ani okna testovací verze)
  const existing = readdirSync(icons).filter((file) => file.endsWith(".png") && existsSync(join(work, "text", file)));
  for (const file of existing) copyFileSync(join(work, PNG_SOURCE[file] ?? "text", file), join(icons, file));

  const frames = ICO.map(([size, from]) => ({ size, data: readFileSync(join(work, `${from}-ico`, `${size}x${size}.png`)) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // rezervováno
  header.writeUInt16LE(1, 2); // typ: ikona
  header.writeUInt16LE(frames.length, 4);
  let offset = 6 + frames.length * 16;
  const entries = frames.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // roviny
    entry.writeUInt16LE(32, 6); // bitů na pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  writeFileSync(join(icons, "icon.ico"), Buffer.concat([header, ...entries, ...frames.map((frame) => frame.data)]));
  console.log("icon.ico:", ICO.map(([size, from]) => `${size} (${from})`).join(", "));
  console.log("PNG:", existing.length, "souborů");
} finally {
  rmSync(work, { recursive: true, force: true });
}
