/**
 * Rozměry obrázku z jeho začátku (hlavičky) – bez dekódování a bez knihoven.
 * Zná PNG, GIF, JPEG, WebP, BMP, ICO (největší obrázek v souboru) a SVG
 * (vektor – ostrý v každé velikosti). Stačí prvních pár desítek kB souboru.
 */

export interface ImageSize {
  width: number;
  height: number;
  /** Vektorový obrázek (SVG) – rozměry nehrají roli. */
  vector?: boolean;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (b: Buffer, at = 0) => b.length >= at + 24 && PNG_SIGNATURE.every((v, i) => b[at + i] === v);

function png(b: Buffer, at = 0): ImageSize | null {
  return isPng(b, at) ? { width: b.readUInt32BE(at + 16), height: b.readUInt32BE(at + 20) } : null;
}

function gif(b: Buffer): ImageSize | null {
  const head = b.toString("ascii", 0, 6);
  return b.length >= 10 && (head === "GIF87a" || head === "GIF89a") ? { width: b.readUInt16LE(6), height: b.readUInt16LE(8) } : null;
}

function jpeg(b: Buffer): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++; // výplň
      continue;
    }
    // Značky bez délky (RST, SOI, EOI, TEM)
    if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      i += 2;
      continue;
    }
    // SOF0–SOF15 kromě DHT (C4), JPG (C8) a DAC (CC) nesou rozměry
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function webp(b: Buffer): ImageSize | null {
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function bmp(b: Buffer): ImageSize | null {
  return b.length >= 26 && b.toString("ascii", 0, 2) === "BM" ? { width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) } : null;
}

/** ICO: adresář obrázků na začátku souboru; 0 v rozměru = 256 px (nebo víc – pak rozhodne vložené PNG). */
function ico(b: Buffer): ImageSize | null {
  if (b.length < 6 || b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) return null;
  const count = b.readUInt16LE(4);
  if (count === 0 || count > 64) return null;
  let best: ImageSize | null = null;
  for (let n = 0; n < count && 6 + n * 16 + 16 <= b.length; n++) {
    const at = 6 + n * 16;
    let size: ImageSize = { width: b[at] || 256, height: b[at + 1] || 256 };
    const offset = b.readUInt32LE(at + 12);
    size = png(b, offset) ?? size;
    if (!best || size.width > best.width) best = size;
  }
  return best;
}

function svg(b: Buffer): ImageSize | null {
  const text = b.toString("utf8", 0, Math.min(b.length, 4096)).trimStart();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text) ? { width: 0, height: 0, vector: true } : null;
}

/** Rozměry obrázku, nebo null (neznámý formát, HTML místo obrázku, useknutý soubor). */
export function imageSize(b: Buffer): ImageSize | null {
  return png(b) ?? gif(b) ?? jpeg(b) ?? webp(b) ?? ico(b) ?? bmp(b) ?? svg(b);
}
