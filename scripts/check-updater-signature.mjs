// Kontrola podpisu aktualizace (.sig vedle instalátoru) stejně, jak ho ověří
// nainstalovaný HubGet (tauri-plugin-updater): podpis klíčem z tauri.conf.json
// a verze v důvěryhodném komentáři – s requireSignedVersion aplikace podpis
// bez verze odmítne (MissingSignedVersion) a aktualizace se nenainstaluje.
// Používají ho workflow Vydání a Podpis aktualizace:
//   node scripts/check-updater-signature.mjs <instalátor> <verze>
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [installer, version] = process.argv.slice(2);
if (!installer || !version) throw new Error("Použití: node scripts/check-updater-signature.mjs <instalátor> <verze>");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const lines = (base64) => Buffer.from(base64, "base64").toString().trim().split("\n");

// Veřejný klíč minisign: "Ed" + id klíče (8 B) + klíč (32 B); podpis: algoritmus (2 B) + id (8 B) + podpis (64 B)
const pub = Buffer.from(lines(config.plugins.updater.pubkey)[1], "base64");
const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pub.subarray(10)]), format: "der", type: "spki" });
const sigLines = lines(readFileSync(`${installer}.sig`, "utf8").trim());
const sig = Buffer.from(sigLines[1], "base64");
const trusted = sigLines[2].replace(/^trusted comment: /, "");

const problems = [];
if (!sig.subarray(2, 10).equals(pub.subarray(2, 10))) problems.push("podpis není od klíče v tauri.conf.json");
const file = readFileSync(installer);
const message = sig.subarray(0, 2).toString() === "ED" ? createHash("blake2b512").update(file).digest() : file;
if (!verify(null, message, key, sig.subarray(10))) problems.push("podpis instalátoru neplatí");
if (!verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted)]), key, Buffer.from(sigLines[3], "base64"))) {
  problems.push("podpis důvěryhodného komentáře neplatí");
}
const signed = trusted.split("\t").find((field) => field.startsWith("version:"))?.slice("version:".length);
if (signed !== version) problems.push(`důvěryhodný komentář nemá verzi ${version} (${signed ? `má ${signed}` : "verze chybí – podepsat s --app-version"})`);

if (problems.length) {
  console.error(`Podpis aktualizace ${installer}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Podpis aktualizace v pořádku: ${trusted}`);
