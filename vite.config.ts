import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Konfigurace Vite. Port 1420 očekává Tauri (`devUrl` v src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Výpisy Rustu (tauri dev) se nemají mazat
  clearScreen: false,
  // Proměnné TAURI_ENV_* (platforma, ladění) jsou dostupné i ve frontendu
  envPrefix: ["VITE_", "TAURI_ENV_"],
  server: {
    port: 1420,
    strictPort: true,
    // Na tomto disku nativní sledování souborů občas vynechá rychle po sobě
    // uložené změny (stránka pak zůstane prázdná). Polling je spolehlivější.
    // Rust (src-tauri) a data pipeline Vite sledovat nemusí – hlavně ne obří src-tauri/target.
    watch: { usePolling: true, interval: 300, ignored: ["**/src-tauri/**", "**/data-pipeline/**"] },
  },
  build: {
    // WebView2 ve Windows 10/11 je vždy aktuální Chromium
    target: "chrome120",
  },
});
