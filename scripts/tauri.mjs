// Obal příkazu `tauri` (pnpm tauri …, npm run tauri …). `tauri dev` spustí jedinou testovací
// verzi Uniboxu:
//  - bez vlastního --config dostane identifikátor org.unibox.dev (src-tauri/tauri.dev.conf.json)
//    a vlastní data – běží vedle nainstalovaného Uniboxu (se stejným identifikátorem by ji
//    ochrana proti druhé instanci hned ukončila a jen přepnula na nainstalovanou aplikaci),
//  - WebView2 má ladění na 127.0.0.1:9222 (CDP) – změny jde ověřovat přímo v ní, bez druhé
//    instance. Jen ve vývoji; sestavená aplikace ho nemá.
// Ostatní příkazy (build, bundle, signer…) jdou do Tauri CLI beze změny.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = createRequire(import.meta.url).resolve("@tauri-apps/cli/tauri.js");

const args = process.argv.slice(2);
const env = { ...process.env };
if (args[0] === "dev") {
  const hasConfig = args.some((a) => a === "--config" || a === "-c" || a.startsWith("--config="));
  if (!hasConfig) args.push("--config", join(root, "src-tauri", "tauri.dev.conf.json"));
  env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS ??= "--remote-debugging-port=9222";
}

// Bez shellu – cesty s mezerami (--config "C:\…") projdou beze změny
const result = spawnSync(process.execPath, [cli, ...args], { stdio: "inherit", cwd: process.cwd(), env });
process.exit(result.status ?? 1);
