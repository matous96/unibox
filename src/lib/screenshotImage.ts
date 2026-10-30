/**
 * Příprava snímku obrazovky k nahrání (snímky aplikací od uživatelů, přílohy kontaktního
 * formuláře): zmenší ho, převede do WebP a vytvoří náhled. Nové zakódování zahodí metadata
 * obrázku (EXIF – fotoaparát, poloha). Server přijme jen WebP do 1 MB (buckety
 * app-screenshots a contact-attachments).
 */

/** Typy obrázků, které jde vybrat, vložit nebo přetáhnout. */
export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];

const MAX_SIDE = 1920;
const THUMB_SIDE = 480;
/** Nejmenší kratší strana – menší obrázek snímkem aplikace nebude. */
const MIN_SIDE = 200;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;
/** Limit bucketu na serveru. */
const MAX_BYTES = 1024 * 1024;
/** Cíl – menší soubory šetří místo i přenos v bezplatném tarifu. */
const TARGET_BYTES = 700 * 1024;

export type ScreenshotProblem = "type" | "size" | "decode" | "small";

export class ScreenshotError extends Error {
  constructor(readonly problem: ScreenshotProblem) {
    super(`Snímek nejde použít: ${problem}`);
  }
}

export interface PreparedScreenshot {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Rozměry zmenšené tak, aby delší strana nepřesáhla `max` (nikdy nezvětšuje). */
function fit(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function encode(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ScreenshotError("decode");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality });
  // Prohlížeč bez kodéru WebP vrátí PNG – server by ho odmítl
  if (blob.type !== "image/webp") throw new ScreenshotError("decode");
  return blob;
}

/**
 * Zmenší obrázek do WebP (snímek a náhled); vyhodí ScreenshotError, když nejde použít.
 * `minSide` – nejmenší kratší strana (výřez chybové hlášky v kontaktním formuláři může být malý).
 */
export async function prepareScreenshot(file: Blob, minSide = MIN_SIDE): Promise<PreparedScreenshot> {
  if (!SCREENSHOT_TYPES.includes(file.type)) throw new ScreenshotError("type");
  if (file.size > MAX_INPUT_BYTES) throw new ScreenshotError("size");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ScreenshotError("decode");
  }
  try {
    if (Math.min(bitmap.width, bitmap.height) < minSide) throw new ScreenshotError("small");
    let size = fit(bitmap.width, bitmap.height, MAX_SIDE);
    let full = await encode(bitmap, size.width, size.height, 0.85);
    // Hodně detailní snímek: nižší kvalita, pak menší rozměr
    for (const [quality, side] of [[0.75, MAX_SIDE], [0.7, 1600], [0.65, 1280]] as const) {
      if (full.size <= TARGET_BYTES) break;
      size = fit(bitmap.width, bitmap.height, side);
      full = await encode(bitmap, size.width, size.height, quality);
    }
    if (full.size > MAX_BYTES) throw new ScreenshotError("size");
    const thumbSize = fit(bitmap.width, bitmap.height, THUMB_SIDE);
    const thumb = await encode(bitmap, thumbSize.width, thumbSize.height, 0.75);
    return { full, thumb, width: size.width, height: size.height };
  } finally {
    bitmap.close();
  }
}
