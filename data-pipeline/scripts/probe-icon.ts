/**
 * Rozměry ikon na zadaných adresách (bez mezipaměti) – ladění zdrojů ikon.
 *   node data-pipeline/scripts/probe-icon.ts <url…>
 */
import { USER_AGENT } from "../src/config.ts";
import { imageSize } from "../src/lib/imageSize.ts";

for (const url of process.argv.slice(2)) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const body = Buffer.from(await res.arrayBuffer());
    const size = imageSize(body);
    console.log(`${res.status} ${size ? (size.vector ? "SVG" : `${size.width}×${size.height}`) : "?"} ${body.length} B ${res.headers.get("content-type")} ${url} → ${res.url}`);
  } catch (error) {
    console.log(`chyba ${(error as Error).message} ${url}`);
  }
}
