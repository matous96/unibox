/**
 * Minimální čtení archivů bez dalších závislostí:
 *  - ZIP (index wingetu je balíček .msix = ZIP),
 *  - tar.gz (buckety Scoopu stažené jako archiv z GitHubu).
 */
import { gunzipSync, inflateRawSync } from "node:zlib";

const MAX32 = 0xffffffff;

/**
 * Přečte soubory ze ZIPu (včetně ZIP64, který používají balíčky .msix);
 * `filter` vybere, které rozbalit (ostatní se přeskočí).
 */
export function readZip(buf: Buffer, filter: (name: string) => boolean): Map<string, Buffer> {
  // Konec centrálního adresáře (EOCD) – hledá se od konce souboru
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP: chybí konec centrálního adresáře");

  let entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  // ZIP64: skutečné hodnoty jsou v záznamu ZIP64 EOCD, na který ukazuje lokátor před EOCD
  if (offset === MAX32 || entries === 0xffff) {
    const locator = eocd - 20;
    if (buf.readUInt32LE(locator) !== 0x07064b50) throw new Error("ZIP64: chybí lokátor");
    const zip64 = Number(buf.readBigUInt64LE(locator + 8));
    if (buf.readUInt32LE(zip64) !== 0x06064b50) throw new Error("ZIP64: poškozený záznam");
    entries = Number(buf.readBigUInt64LE(zip64 + 32));
    offset = Number(buf.readBigUInt64LE(zip64 + 48));
  }
  const files = new Map<string, Buffer>();

  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP: poškozený centrální adresář");
    const method = buf.readUInt16LE(offset + 10);
    let compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    let localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);

    // ZIP64 rozšíření (id 0x0001): v pořadí jen ty hodnoty, které mají v hlavičce 0xFFFFFFFF
    if (compressedSize === MAX32 || uncompressedSize === MAX32 || localOffset === MAX32) {
      let p = offset + 46 + nameLength;
      const end = p + extraLength;
      while (p + 4 <= end) {
        const id = buf.readUInt16LE(p);
        const size = buf.readUInt16LE(p + 2);
        if (id === 0x0001) {
          let q = p + 4;
          if (uncompressedSize === MAX32) q += 8;
          if (compressedSize === MAX32) {
            compressedSize = Number(buf.readBigUInt64LE(q));
            q += 8;
          }
          if (localOffset === MAX32) localOffset = Number(buf.readBigUInt64LE(q));
          break;
        }
        p += 4 + size;
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;

    if (!filter(name)) continue;
    // Data začínají za místní hlavičkou souboru
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buf.subarray(start, start + compressedSize);
    if (method === 0) files.set(name, Buffer.from(data));
    else if (method === 8) files.set(name, inflateRawSync(data));
    else throw new Error(`ZIP: nepodporovaná komprese ${method} (${name})`);
  }
  return files;
}

/** Projde soubory v archivu tar.gz (pax hlavičky GitHubu s dlouhými cestami zvládá). */
export function* readTarGz(buf: Buffer): Generator<{ path: string; data: Buffer }> {
  const tar = gunzipSync(buf);
  let offset = 0;
  let paxPath: string | null = null;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // konec archivu
    const name = cString(header, 0, 100);
    const size = parseInt(cString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = cString(header, 345, 155);
    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (type === "x") {
      // Rozšířená hlavička pax: záznamy „délka klíč=hodnota\n“
      const match = data.toString("utf8").match(/\d+ path=([^\n]*)\n/);
      paxPath = match ? match[1] : null;
      continue;
    }
    if (type === "g") continue; // globální hlavička (komentář s commitem)
    const path = paxPath ?? (prefix ? `${prefix}/${name}` : name);
    paxPath = null;
    if (type === "0" || type === "\0") yield { path, data };
  }
}

const cString = (buf: Buffer, start: number, length: number) => {
  const slice = buf.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.toString("utf8", 0, end < 0 ? length : end);
};
