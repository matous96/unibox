// Web Uniboxu je čisté statické HTML/CSS/JS – Vite slouží jen jako lokální server
// a volitelně pro build do website/dist (pnpm exec vite build -c website/vite.config.mjs).
import { fileURLToPath } from "node:url";

const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default {
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { port: 4321, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Víc stránek: úvod a novinky (historie změn), česky i anglicky (složka en/)
    rollupOptions: {
      input: {
        index: page("index.html"),
        novinky: page("novinky.html"),
        "srovnani-winstall": page("srovnani-winstall.html"),
        "srovnani-ninite": page("srovnani-ninite.html"),
        "srovnani-unigetui": page("srovnani-unigetui.html"),
        "srovnani-chocolatey": page("srovnani-chocolatey.html"),
        soukromi: page("soukromi.html"),
        "podpis-kodu": page("podpis-kodu.html"),
        "en/index": page("en/index.html"),
        "en/changelog": page("en/changelog.html"),
        "en/compare-winstall": page("en/compare-winstall.html"),
        "en/compare-ninite": page("en/compare-ninite.html"),
        "en/compare-unigetui": page("en/compare-unigetui.html"),
        "en/compare-chocolatey": page("en/compare-chocolatey.html"),
        "en/privacy": page("en/privacy.html"),
        "en/code-signing": page("en/code-signing.html"),
      },
    },
  },
};
