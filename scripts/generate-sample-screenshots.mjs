/**
 * Vygeneruje ukázkové „screenshoty“ (SVG makety oken aplikací) do
 * public/sample-screenshots/ a přiřadí je balíčkům v src/data/catalog.sample.json
 * podle jejich hlavní kategorie.
 *
 * Slouží jen pro vývoj s ukázkovými daty – skutečné screenshoty dodá
 * data pipeline (krok 4).
 *
 * Spuštění:  node scripts/generate-sample-screenshots.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "sample-screenshots");
const catalogPath = join(root, "src", "data", "catalog.sample.json");
mkdirSync(outDir, { recursive: true });

const W = 1280;
const H = 800;

/** Barevná schémata: tmavé a světlé okno. */
const THEMES = {
  dark: { bg: "#16181f", panel: "#1d2029", panel2: "#252935", line: "#2e3340", text: "#d7dbe6", dim: "#5d6577" },
  light: { bg: "#f6f7f9", panel: "#ffffff", panel2: "#eceef3", line: "#dfe2e8", text: "#2b3140", dim: "#a3aab8" },
};

// --- Pomocné funkce pro kreslení ------------------------------------------
const rect = (x, y, w, h, fill, r = 0, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
/** „Řádek textu“ – zaoblený pruh. */
const bar = (x, y, w, fill, h = 8) => rect(x, y, w, h, fill, h / 2);
/** Pseudonáhodná čísla, ať je výstup pokaždé stejný. */
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Rámeček okna s titulkovou lištou ve stylu Windows 11. */
function frame(t, title, accent, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><linearGradient id="acc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent[0]}"/><stop offset="1" stop-color="${accent[1]}"/></linearGradient></defs>
${rect(0, 0, W, H, t.bg)}
${rect(0, 0, W, 40, t.panel)}
${rect(0, 39, W, 1, t.line)}
${rect(16, 13, 14, 14, "url(#acc)", 4)}
<text x="40" y="25" font-family="Segoe UI, sans-serif" font-size="13" fill="${t.text}">${title}</text>
${bar(1150, 19, 12, t.dim, 2)}
${rect(1196, 14, 11, 11, "none", 1, `stroke="${t.dim}" stroke-width="1.5"`)}
<path d="M1242 14 l11 11 M1253 14 l-11 11" stroke="${t.dim}" stroke-width="1.5"/>
${body}
</svg>`;
}

// --- Jednotlivé typy aplikací ----------------------------------------------
const layouts = {
  browser(t, a, r) {
    let s = rect(0, 40, W, 44, t.panel2);
    for (let i = 0; i < 4; i++) s += rect(12 + i * 200, 48, 190, 36, i === 0 ? t.bg : "transparent", 8) + bar(48 + i * 200, 62, 110, i === 0 ? t.text : t.dim);
    s += rect(0, 84, W, 48, t.bg) + rect(120, 92, 1040, 32, t.panel2, 16) + bar(150, 104, 260, t.dim);
    s += rect(0, 132, W, H - 132, t.panel);
    s += rect(80, 170, W - 160, 280, "url(#acc)", 18);
    s += bar(130, 260, 420, "#ffffff", 26) + bar(130, 310, 300, "#ffffffaa", 12) + rect(130, 360, 150, 44, "#ffffff", 22);
    for (let i = 0; i < 3; i++) {
      const x = 80 + i * 380;
      s += rect(x, 490, 360, 260, t.panel2, 14) + rect(x + 20, 510, 320, 140, t.line, 10);
      s += bar(x + 20, 672, 200 + r() * 100, t.text, 10) + bar(x + 20, 696, 260, t.dim) + bar(x + 20, 714, 180, t.dim);
    }
    return s;
  },

  editor(t, a, r) {
    const syntax = [a[0], a[1], "#e5c07b", "#98c379", "#56b6c2", t.text];
    let s = rect(0, 40, 48, H - 64, t.panel2);
    for (let i = 0; i < 5; i++) s += rect(12, 60 + i * 52, 24, 24, i === 0 ? a[0] : t.dim, 6, i === 0 ? "" : 'opacity="0.5"');
    s += rect(48, 40, 240, H - 64, t.panel) + bar(68, 60, 90, t.dim, 7);
    for (let i = 0; i < 16; i++) {
      const indent = [0, 16, 16, 32, 32, 16, 0][i % 7];
      s += rect(68 + indent, 88 + i * 28, 12, 12, i === 4 ? a[0] : t.dim, 3, 'opacity="0.7"') + bar(88 + indent, 90 + i * 28, 60 + r() * 90, i === 4 ? t.text : t.dim);
    }
    s += rect(288, 40, W - 288, 36, t.panel2) + rect(288, 40, 170, 36, t.bg) + bar(310, 54, 110, t.text);
    for (let i = 0; i < 24; i++) {
      const y = 96 + i * 26;
      s += bar(300, y, 18, t.dim, 7);
      let x = 350 + ((i * 7) % 4) * 28;
      if (i % 6 === 5) continue; // prázdný řádek
      const tokens = 2 + Math.floor(r() * 4);
      for (let k = 0; k < tokens; k++) {
        const w = 30 + r() * 110;
        s += bar(x, y, w, syntax[Math.floor(r() * syntax.length)], 8);
        x += w + 10;
      }
    }
    s += rect(1170, 76, 1, H - 100, t.line);
    for (let i = 0; i < 60; i++) s += rect(1185, 86 + i * 10, 20 + r() * 60, 4, t.dim, 1, 'opacity="0.35"');
    s += rect(0, H - 24, W, 24, a[0]) + bar(16, H - 16, 120, "#ffffffcc", 7) + bar(1100, H - 16, 150, "#ffffffcc", 7);
    return s;
  },

  chat(t, a, r) {
    let s = rect(0, 40, 72, H - 40, t.panel2);
    for (let i = 0; i < 7; i++) s += circle(36, 80 + i * 60, 22, i === 0 ? "url(#acc)" : t.line);
    s += rect(72, 40, 240, H - 40, t.panel) + bar(92, 64, 140, t.text, 12);
    for (let i = 0; i < 14; i++) s += bar(104, 110 + i * 34, 80 + r() * 100, i === 2 ? t.text : t.dim, 9) + bar(88, 111 + i * 34, 7, t.dim, 7);
    s += rect(312, 40, W - 312 - 230, 50, t.bg) + bar(332, 60, 160, t.text, 11) + rect(312, 90, W - 542, 1, t.line);
    for (let i = 0; i < 7; i++) {
      const y = 120 + i * 82;
      s += circle(352, y + 18, 20, i % 3 === 0 ? a[0] : i % 3 === 1 ? a[1] : "#e5c07b");
      s += bar(386, y + 4, 90 + r() * 60, t.text, 10) + bar(386 + 170, y + 5, 50, t.dim, 7);
      s += bar(386, y + 26, 280 + r() * 260, t.dim) + (r() > 0.5 ? bar(386, y + 44, 160 + r() * 200, t.dim) : "");
    }
    s += rect(332, H - 70, W - 582, 48, t.panel2, 12) + bar(356, H - 50, 220, t.dim);
    s += rect(W - 230, 40, 230, H - 40, t.panel);
    for (let i = 0; i < 12; i++) s += circle(W - 200, 90 + i * 44, 14, t.line) + bar(W - 176, 86 + i * 44, 80 + r() * 50, t.dim);
    return s;
  },

  game(t, a, r) {
    let s = rect(0, 40, 260, H - 40, t.panel);
    s += bar(24, 70, 120, t.text, 14);
    for (let i = 0; i < 14; i++) s += rect(24, 110 + i * 42, 26, 26, t.line, 6) + bar(62, 119 + i * 42, 80 + r() * 90, i === 1 ? t.text : t.dim);
    s += rect(290, 70, W - 320, 300, "url(#acc)", 18);
    s += bar(330, 250, 360, "#ffffff", 28) + rect(330, 300, 140, 46, "#ffffff", 10) + rect(484, 300, 46, 46, "#ffffff55", 10);
    s += bar(290, 400, 160, t.text, 14);
    const hues = [200, 340, 30, 140, 270, 0, 180, 50, 300, 100];
    for (let i = 0; i < 10; i++) {
      const x = 290 + (i % 5) * 194;
      const y = 434 + Math.floor(i / 5) * 180;
      s += rect(x, y, 178, 160, `hsl(${hues[i]} 55% ${t === THEMES.dark ? 38 : 62}%)`, 12);
    }
    return s;
  },

  media(t, a, r) {
    let s = rect(0, 40, W - 320, H - 140, "#08090c");
    s += rect(0, 40, W - 320, H - 140, "url(#acc)", 0, 'opacity="0.25"');
    s += circle((W - 320) / 2, 360, 46, "#ffffff22") + `<path d="M${(W - 320) / 2 - 14} 336 l38 24 l-38 24z" fill="#fff"/>`;
    s += rect(0, H - 100, W - 320, 100, t.panel);
    s += rect(30, H - 80, W - 380, 6, t.line, 3) + rect(30, H - 80, (W - 380) * 0.38, 6, a[0], 3) + circle(30 + (W - 380) * 0.38, H - 77, 9, "#fff");
    for (let i = 0; i < 5; i++) s += circle(380 + i * 50, H - 38, i === 2 ? 20 : 12, i === 2 ? a[0] : t.dim);
    s += bar(30, H - 42, 90, t.dim) + bar(W - 440, H - 42, 90, t.dim);
    s += rect(W - 320, 40, 320, H - 40, t.panel) + bar(W - 296, 66, 110, t.text, 12);
    for (let i = 0; i < 11; i++) {
      const y = 104 + i * 62;
      s += rect(W - 296, y, 80, 48, `hsl(${(i * 47) % 360} 45% 45%)`, 6) + bar(W - 202, y + 10, 120 + r() * 50, i === 3 ? a[0] : t.text, 9) + bar(W - 202, y + 30, 80, t.dim, 7);
    }
    return s;
  },

  design(t, a, r) {
    let s = rect(0, 40, W, 48, t.panel);
    for (let i = 0; i < 7; i++) s += rect(16 + i * 40, 50, 28, 28, i === 1 ? a[0] : t.panel2, 6);
    s += rect(0, 88, 240, H - 88, t.panel);
    for (let i = 0; i < 15; i++) s += rect(18 + (i % 4 ? 16 : 0), 108 + i * 32, 14, 14, t.dim, 3, 'opacity="0.6"') + bar(40 + (i % 4 ? 16 : 0), 111 + i * 32, 70 + r() * 70, i === 5 ? a[0] : t.dim);
    s += rect(240, 88, W - 520, H - 88, t.panel2);
    s += rect(330, 140, 560, 600, t.panel, 4, `stroke="${t.line}"`);
    s += rect(370, 180, 480, 200, "url(#acc)", 16) + circle(480, 500, 70, a[1], 'opacity="0.85"') + rect(600, 440, 210, 130, "#e5c07b", 14, 'opacity="0.9"');
    s += bar(370, 610, 300, t.text, 18) + bar(370, 646, 420, t.dim, 10) + bar(370, 666, 360, t.dim, 10);
    s += rect(596, 436, 218, 138, "none", 2, `stroke="${a[0]}" stroke-width="2"`);
    for (const [x, y] of [[596, 436], [814, 436], [596, 574], [814, 574]]) s += rect(x - 5, y - 5, 10, 10, "#fff", 1, `stroke="${a[0]}" stroke-width="2"`);
    s += rect(W - 280, 88, 280, H - 88, t.panel);
    for (let i = 0; i < 9; i++) s += bar(W - 256, 112 + i * 56, 70, t.dim, 7) + rect(W - 256, 128 + i * 56, 232, 26, t.panel2, 6);
    return s;
  },

  docs(t, a, r) {
    let s = rect(0, 40, W, 96, t.panel) + rect(0, 135, W, 1, t.line);
    for (let i = 0; i < 6; i++) s += bar(24 + i * 90, 54, 60, i === 0 ? a[0] : t.dim, 9);
    for (let i = 0; i < 18; i++) s += rect(24 + i * 44, 86, 30, 30, t.panel2, 6);
    s += rect(0, 136, W, H - 136, t.panel2);
    s += rect(290, 166, 700, H - 166, "#ffffff", 4, 'filter="drop-shadow(0 2px 6px rgba(0,0,0,.15))"');
    s += bar(350, 230, 380, "#1f2430", 24) + bar(350, 274, 200, a[0], 10);
    let y = 320;
    for (let p = 0; p < 4; p++) {
      const lines = 3 + Math.floor(r() * 3);
      for (let i = 0; i < lines; i++) s += bar(350, (y += 22), i === lines - 1 ? 200 + r() * 250 : 580, "#c4c9d4", 8);
      y += 26;
    }
    return s;
  },

  dashboard(t, a, r) {
    let s = rect(0, 40, 220, H - 40, t.panel) + rect(20, 64, 32, 32, "url(#acc)", 8) + bar(62, 74, 90, t.text, 12);
    for (let i = 0; i < 9; i++) s += rect(12, 124 + i * 44, 196, 36, i === 0 ? t.panel2 : "transparent", 8) + rect(26, 134 + i * 44, 16, 16, i === 0 ? a[0] : t.dim, 4) + bar(54, 138 + i * 44, 70 + r() * 60, i === 0 ? t.text : t.dim);
    s += bar(250, 70, 240, t.text, 18);
    for (let i = 0; i < 4; i++) {
      const x = 250 + i * 252;
      s += rect(x, 110, 236, 110, t.panel, 14) + bar(x + 20, 132, 90, t.dim) + bar(x + 20, 160, 120, i === 0 ? a[0] : t.text, 20) + bar(x + 20, 194, 60, i % 2 ? "#ef4444" : "#22c55e", 7);
    }
    s += rect(250, 240, 740, 300, t.panel, 14) + bar(270, 262, 160, t.text, 11);
    let pts = "";
    for (let i = 0; i <= 20; i++) pts += `${280 + i * 34},${480 - (Math.sin(i / 2.5) * 50 + r() * 60 + 60)} `;
    s += `<polyline points="${pts}" fill="none" stroke="${a[0]}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<polygon points="280,520 ${pts} 960,520" fill="${a[0]}" opacity="0.12"/>`;
    s += rect(1010, 240, 242, 300, t.panel, 14) + circle(1131, 380, 80, "none", `stroke="${t.line}" stroke-width="26"`);
    s += `<circle cx="1131" cy="380" r="80" fill="none" stroke="${a[1]}" stroke-width="26" stroke-dasharray="330 503" transform="rotate(-90 1131 380)"/>`;
    s += rect(250, 560, 1002, 210, t.panel, 14);
    for (let i = 0; i < 5; i++) s += rect(270, 590 + i * 34, 962, 1, t.line) + bar(270, 600 + i * 34, 160, t.text, 8) + bar(560, 600 + i * 34, 90, t.dim, 8) + bar(800, 600 + i * 34, 120, t.dim, 8) + bar(1130, 600 + i * 34, 70, i % 2 ? a[1] : a[0], 8);
    return s;
  },
};

// --- Generování souborů ----------------------------------------------------
const ACCENTS = [
  ["#6b83ff", "#9b5cff"],
  ["#14b8a6", "#0ea5e9"],
  ["#f97316", "#ec4899"],
];

const TITLES = {
  browser: "Nový panel", editor: "main.ts", chat: "# obecné", game: "Knihovna",
  media: "Přehrávač", design: "Návrh – Domovská obrazovka", docs: "Dokument1", dashboard: "Přehled",
};

const files = [];
let seed = 7;
for (const [type, draw] of Object.entries(layouts)) {
  // Tři varianty každého typu: tmavá, světlá, tmavá s jiným akcentem
  [["dark", 0], ["light", 1], ["dark", 2]].forEach(([theme, accentIndex], i) => {
    const name = `${type}-${i + 1}.svg`;
    const accent = ACCENTS[accentIndex];
    const svg = frame(THEMES[theme], TITLES[type], accent, draw(THEMES[theme], accent, rng(seed++ * 7919)));
    writeFileSync(join(outDir, name), svg);
    files.push(name);
  });
}
console.log(`Vygenerováno ${files.length} SVG do ${outDir}`);

// --- Přiřazení do ukázkového katalogu --------------------------------------
const CATEGORY_TYPE = {
  browsers: "browser", development: "editor", communication: "chat", games: "game",
  multimedia: "media", graphics: "design", productivity: "docs",
  utilities: "dashboard", security: "dashboard", system: "dashboard",
};

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
for (const pkg of catalog.packages) {
  const type = CATEGORY_TYPE[pkg.categories[0]] ?? "dashboard";
  // Vedlejší kategorie přidá čtvrtý snímek jiného typu, ať galerie není jednotvárná.
  const secondType = CATEGORY_TYPE[pkg.categories[1]];
  const shots = [1, 2, 3].map((n) => `/sample-screenshots/${type}-${n}.svg`);
  if (secondType && secondType !== type) shots.push(`/sample-screenshots/${secondType}-1.svg`);
  pkg.screenshots = shots;
}

// Jeden balíček na řádek – soubor zůstane čitelný.
const out =
  `{\n  "schemaVersion": ${catalog.schemaVersion},\n  "generatedAt": ${JSON.stringify(catalog.generatedAt)},\n` +
  (catalog.sample ? `  "sample": true,\n` : "") +
  (catalog.stats ? `  "stats": ${JSON.stringify(catalog.stats)},\n` : "") +
  `  "packages": [\n` +
  catalog.packages.map((p) => "    " + JSON.stringify(p)).join(",\n") +
  "\n  ]\n}\n";
writeFileSync(catalogPath, out);
console.log(`Screenshoty přiřazeny ${catalog.packages.length} balíčkům v ${catalogPath}`);
