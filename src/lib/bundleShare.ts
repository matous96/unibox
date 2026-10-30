/**
 * Sdílení sady balíčků odkazem: sada se zakóduje přímo do odkazu (base64url
 * z kompaktního JSONu), takže není potřeba žádný server. Příjemce odkaz
 * otevře v HubGetu, uvidí seznam aplikací a může je nainstalovat.
 */
import { isSourceId } from "@/services/managers/sources";
import type { BundleFile, BundleItem } from "@/store/bundle";

/** Kompaktní tvar: n = název, p = [zdroj, id balíčku, id aplikace, název, verze]. */
type Payload = { n: string; p: [string, string, string, string, string][] };

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (data: string) => {
  const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

export function encodeBundle(name: string, items: BundleItem[]): string {
  const payload: Payload = { n: name, p: items.map((i) => [i.source, i.packageId, i.appId, i.name, i.version ?? ""]) };
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Rozkóduje sadu z odkazu; při neplatných datech vyhodí výjimku. */
export function decodeBundle(data: string): BundleFile {
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(data))) as Payload;
  if (!Array.isArray(payload.p)) throw new Error("invalid bundle link");
  const packages: BundleItem[] = payload.p
    .filter(([source, packageId, appId]) => isSourceId(source) && typeof packageId === "string" && typeof appId === "string")
    .map(([source, packageId, appId, name, version]) => ({
      source: source as BundleItem["source"],
      packageId,
      appId,
      name: name || packageId,
      version: version || undefined,
    }));
  return { format: "unibox-bundle", version: 1, name: payload.n ?? "", createdAt: "", packages };
}
