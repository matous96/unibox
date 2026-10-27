// Podpis souboru (Authenticode) přes signtool.exe – Windows pak u Uniboxu ukáže
// vydavatele místo „Neznámý vydavatel“ a podepsaný instalátor si u SmartScreenu
// postupně buduje reputaci. Volá ho Tauri při sestavení pro každý podepisovaný
// soubor (unibox.exe, instalátor NSIS i jeho odinstalátor, MSI); zapíná ho
// scripts/release.mjs (bundle.windows.signCommand), když je certifikát k dispozici.
//
// Certifikát z prostředí (jeden ze dvou způsobů):
//   UNIBOX_SIGN_PFX            soubor .pfx (vývojový z dev-certificate.mjs, nebo vlastní)
//   UNIBOX_SIGN_PFX_PASSWORD   heslo k souboru .pfx
//   UNIBOX_SIGN_THUMBPRINT     otisk (SHA-1) certifikátu v úložišti Windows (Aktuální
//                              uživatel → Osobní) – i certifikát na tokenu nebo v cloudovém
//                              HSM, který jeho ovladač do úložiště zpřístupní
// Volitelně:
//   UNIBOX_SIGN_TIMESTAMP_URL  server časového razítka RFC 3161 (výchozí DigiCert)
//   UNIBOX_SIGNTOOL            cesta k signtool.exe (jinak nejnovější z Windows SDK, pak PATH)
//
//   node scripts/sign.mjs <soubor>
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Časové razítko – podpis zůstane platný i po vypršení certifikátu. */
const TIMESTAMP_URL = "http://timestamp.digicert.com";
const ATTEMPTS = 3;

/** Čím podepisovat podle prostředí, nebo null (sestavení bez podpisu). */
export function signingIdentity(env = process.env) {
  if (env.UNIBOX_SIGN_PFX) return { kind: "pfx", file: env.UNIBOX_SIGN_PFX, password: env.UNIBOX_SIGN_PFX_PASSWORD ?? "" };
  if (env.UNIBOX_SIGN_THUMBPRINT) return { kind: "store", thumbprint: env.UNIBOX_SIGN_THUMBPRINT.replace(/[^0-9a-f]/gi, "") };
  return null;
}

/** Popis certifikátu pro výpis (bez hesla). */
export const describeIdentity = (identity) =>
  identity.kind === "pfx" ? `soubor ${identity.file}` : `certifikát ${identity.thumbprint} z úložiště Windows`;

const compareVersions = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return x.reduce((order, part, i) => order || part - y[i], 0);
};

/** signtool.exe: UNIBOX_SIGNTOOL, nejnovější x64 z Windows SDK, jinak z PATH. */
export function findSigntool(env = process.env) {
  if (env.UNIBOX_SIGNTOOL) return env.UNIBOX_SIGNTOOL;
  const kits = join(env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  if (existsSync(kits)) {
    const versions = readdirSync(kits).filter((v) => /^\d+\.\d+\.\d+\.\d+$/.test(v)).sort(compareVersions).reverse();
    for (const version of versions) {
      const signtool = join(kits, version, "x64", "signtool.exe");
      if (existsSync(signtool)) return signtool;
    }
  }
  return "signtool.exe";
}

/** Parametry `signtool sign`: SHA-256, časové razítko RFC 3161, název programu a certifikát. */
export function signArgs(identity, file, env = process.env) {
  const args = ["sign", "/fd", "SHA256", "/tr", env.UNIBOX_SIGN_TIMESTAMP_URL || TIMESTAMP_URL, "/td", "SHA256", "/d", "Unibox"];
  if (identity.kind === "pfx") {
    args.push("/f", identity.file);
    if (identity.password) args.push("/p", identity.password);
  } else {
    args.push("/sha1", identity.thumbprint);
  }
  args.push(file);
  return args;
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function main() {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.error(`Soubor k podpisu nenalezen: ${file ?? "(nezadán)"}`);
    process.exit(1);
  }
  const identity = signingIdentity();
  if (!identity) {
    console.error("Certifikát pro podpis není nastavený (UNIBOX_SIGN_PFX nebo UNIBOX_SIGN_THUMBPRINT).");
    process.exit(1);
  }
  const signtool = findSigntool();
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const result = spawnSync(signtool, signArgs(identity, file), { encoding: "utf8" });
    if (result.status === 0) {
      console.log(`Podepsáno (${describeIdentity(identity)}): ${file}`);
      return;
    }
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || result.error?.message || `kód ${result.status}`;
    console.error(`signtool selhal (pokus ${attempt}/${ATTEMPTS}): ${output}`);
    // Znovu jen při výpadku serveru časového razítka – špatné heslo nebo certifikát se nespraví
    if (!/timestamp|time stamp/i.test(output)) break;
    if (attempt < ATTEMPTS) sleep(3000 * attempt);
  }
  // Nastavený certifikát, který nejde použít, má sestavení zastavit – ne vydat nepodepsaný instalátor
  process.exit(1);
}

// Spuštěno přímo (ne importováno z release.mjs); cesty ve Windows bez ohledu na velikost písmen
const invoked = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invoked) main();
