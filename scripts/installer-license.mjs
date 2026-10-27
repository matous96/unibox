// Stránka „Ochrana soukromí a licence“ v instalátoru (NSIS i MSI – bundle.licenseFile):
// převede src-tauri/installer/license.txt (UTF-8) na license.rtf. RTF kvůli MSI
// (WiX bere jen RTF) – znaky mimo ASCII jako \uN?, takže čeština projde v obou.
// Instalátor zásady ukáže před instalací (podmínka SignPath Foundation).
//   node scripts/installer-license.mjs   (po každé změně license.txt)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "installer");

/** Text do RTF: řídicí znaky RTF escapovat, mimo ASCII jako \uN? (N = 16bitové číslo se znaménkem). */
function rtfText(text) {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    if (char === "\\" || char === "{" || char === "}") out += `\\${char}`;
    else if (code < 0x80) out += char;
    else if (code <= 0xffff) out += `\\u${code > 0x7fff ? code - 0x10000 : code}?`;
    else {
      // Mimo základní rovinu – jako náhradní pár UTF-16
      const s = String.fromCodePoint(code);
      for (let i = 0; i < 2; i++) out += `\\u${s.charCodeAt(i) - 0x10000}?`;
    }
  }
  return out;
}

export function toRtf(source) {
  const lines = source.replace(/\r\n?/g, "\n").trimEnd().split("\n");
  const body = lines
    .map((line) => {
      if (line.startsWith("# ")) return `{\\b\\fs24 ${rtfText(line.slice(2))}}\\par`;
      if (line.startsWith("## ")) return `\\sb160{\\b ${rtfText(line.slice(3))}}\\sb0\\par`;
      return `${rtfText(line)}\\par`;
    })
    .join("\n");
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss\\fcharset0 Segoe UI;}}\n\\viewkind4\\pard\\sa60\\f0\\fs17\n${body}\n}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rtf = toRtf(readFileSync(join(dir, "license.txt"), "utf8"));
  writeFileSync(join(dir, "license.rtf"), rtf, "ascii");
  console.log(`license.rtf: ${rtf.length} znaků`);
}
