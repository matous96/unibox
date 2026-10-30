// Šifrování záloh Supabase (.github/workflows/supabase.yml). Artefakty veřejného
// repozitáře si může stáhnout kdokoli, proto záloha z GitHubu odchází jen
// zašifrovaná heslem: scrypt → AES-256-GCM, hlavička je ověřená spolu s daty.
//   node scripts/backup-crypt.mjs encrypt <soubor> [výstup]      (výstup: <soubor>.enc)
//   node scripts/backup-crypt.mjs decrypt <soubor.enc> [výstup]  (výstup: bez .enc)
//   pnpm backup:decrypt unibox-supabase-2026-11-01.tar.gz.enc
// Heslo: proměnná BACKUP_PASSPHRASE, jinak se zeptá (zadání se nezobrazuje).
// Výstup vznikne až po úspěšném dokončení – při špatném hesle nezůstane nic.
//
// Formát: "UNIBOXBK" | verze | log2 N | r | p | sůl 16 B | IV 12 B | šifrovaná data | tag 16 B
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { open, rename, stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MAGIC = Buffer.from("UNIBOXBK");
const VERSION = 1;
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEADER = MAGIC.length + 4 + SALT + IV;
// ~128 MB paměti a necelá sekunda na odvození klíče – hádání hesla hrubou silou je drahé
const COST = { log2N: 17, r: 8, p: 1 };
/** Nejkratší heslo pro šifrování. */
export const MIN_PASSPHRASE = 20;

function deriveKey(passphrase, salt, { log2N, r, p }) {
  const N = 2 ** log2N;
  return new Promise((resolve, reject) =>
    // NFC – stejné heslo zadané na Linuxu i ve Windows dá stejný klíč
    scrypt(passphrase.normalize("NFC"), salt, 32, { N, r, p, maxmem: 256 * N * r }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** Zapíše výstup přes dočasný soubor; existující soubor nepřepíše. */
async function writeAtomically(output, source, transform) {
  if (existsSync(output)) throw new Error(`Soubor už existuje: ${output}`);
  const partial = `${output}.part`;
  try {
    await pipeline(source, transform, createWriteStream(partial, { mode: 0o600 }));
    await rename(partial, output);
  } catch (error) {
    await unlink(partial).catch(() => {});
    throw error;
  }
}

/** Zašifruje soubor heslem. */
export async function encryptFile(input, output, passphrase) {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION, COST.log2N, COST.r, COST.p]), salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", await deriveKey(passphrase, salt, COST), iv);
  cipher.setAAD(header);
  await writeAtomically(output, createReadStream(input), async function* (source) {
    yield header;
    for await (const chunk of source) yield cipher.update(chunk);
    yield cipher.final();
    yield cipher.getAuthTag();
  });
}

/** Rozšifruje soubor; špatné heslo nebo jakákoli změna v souboru skončí chybou. */
export async function decryptFile(input, output, passphrase) {
  const { size } = await stat(input);
  if (size < HEADER + TAG) throw new Error("Soubor není záloha HubGetu.");
  const header = Buffer.alloc(HEADER);
  const tag = Buffer.alloc(TAG);
  const file = await open(input, "r");
  try {
    await file.read(header, 0, HEADER, 0);
    await file.read(tag, 0, TAG, size - TAG);
  } finally {
    await file.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Soubor není záloha HubGetu.");
  const [version, log2N, r, p] = header.subarray(MAGIC.length, MAGIC.length + 4);
  if (version !== VERSION) throw new Error(`Nepodporovaná verze zálohy: ${version}`);
  // Meze chrání před hlavičkou, která by si řekla o gigabajty paměti
  if (log2N < 14 || log2N > 20 || r < 1 || r > 16 || p < 1 || p > 4) throw new Error("Poškozená hlavička zálohy.");
  const salt = header.subarray(MAGIC.length + 4, MAGIC.length + 4 + SALT);
  const iv = header.subarray(HEADER - IV);
  const decipher = createDecipheriv("aes-256-gcm", await deriveKey(passphrase, salt, { log2N, r, p }), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const data =
    size > HEADER + TAG ? createReadStream(input, { start: HEADER, end: size - TAG - 1 }) : Readable.from([]);
  try {
    await writeAtomically(output, data, async function* (source) {
      for await (const chunk of source) yield decipher.update(chunk);
      yield decipher.final();
    });
  } catch (error) {
    if (/authenticate/i.test(error.message)) throw new Error("Špatné heslo, nebo je záloha poškozená.");
    throw error;
  }
}

/** Zeptá se na heslo v terminálu bez zobrazení zadaných znaků. */
export function askPassphrase(question, input = process.stdin, output = process.stderr) {
  if (!input.isTTY) return Promise.reject(new Error("Heslo zadejte v proměnné BACKUP_PASSPHRASE."));
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (text) => {
      // Šipky a další klávesy s escape sekvencí do hesla nepatří
      if (text.startsWith("\u001b")) return;
      for (const char of text) {
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u0003") return finish(new Error("Zrušeno."));
        if (char === "\b" || char === "\u007f") value = Array.from(value).slice(0, -1).join("");
        else if (char >= " ") value += char;
      }
    };
    output.write(question);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.on("data", onData);
    input.resume();
  });
}

async function main([command, input, output]) {
  if ((command !== "encrypt" && command !== "decrypt") || !input) {
    throw new Error("Použití: node scripts/backup-crypt.mjs encrypt|decrypt <soubor> [výstup]");
  }
  const target = output ?? (command === "encrypt" ? `${input}.enc` : input.replace(/\.enc$/i, ""));
  if (target === input) throw new Error("Zadejte název výstupního souboru.");
  const passphrase = process.env.BACKUP_PASSPHRASE || (await askPassphrase("Heslo zálohy: "));
  if (command === "encrypt") {
    if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Heslo musí mít aspoň ${MIN_PASSPHRASE} znaků.`);
    await encryptFile(input, target, passphrase);
    console.log(`Zašifrováno: ${target}`);
  } else {
    await decryptFile(input, target, passphrase);
    console.log(`Rozšifrováno: ${target}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
