/**
 * Odkazy unibox:// z webu Uniboxu a sdílených sad → cesta v aplikaci.
 *
 *   unibox://app/mozilla-firefox                 →  detail aplikace
 *   unibox://bundle?d=…                          →  sdílená sada (data v odkazu, lib/bundleShare.ts)
 *   unibox://import?apps=mozilla-firefox,…&name=… →  předvyplněná hromadná instalace
 *
 * Aplikace v `apps` mohou být id z katalogu („videolan-vlc“), balíček
 * se zdrojem („winget:VideoLAN.VLC“, „scoop:extras/vlc“) nebo samotné id
 * balíčku WinGetu („VideoLAN.VLC“). Odkaz nic neinstaluje sám – jen otevře
 * seznam, instalaci potvrdí uživatel.
 *
 * Windows předá odkaz přes tauri-plugin-deep-link (aplikace je obsluhou
 * schématu unibox://; běžící Unibox ho dostane od druhého spuštění).
 */
export function deepLinkToPath(url: string): string | null {
  // Ručně, ne přes URL: starší Chromium (WebView2) u nestandardních schémat neodděluje host
  const match = url.trim().match(/^unibox:\/*([^?#]*)(?:\?([^#]*))?/i);
  if (!match) return null;
  // unibox://import?… i unibox://import/?… (prohlížeče občas přidají lomítko)
  const [action = "", first] = match[1].split("/").filter(Boolean);
  const params = queryParams(match[2] ?? "");

  switch (action.toLowerCase()) {
    case "app":
      return first ? `/app/${first}` : null;
    case "bundle": {
      const data = params.get("d");
      return data ? `/bundles/shared?d=${encodeURIComponent(data)}` : null;
    }
    case "import": {
      const apps = params.get("apps");
      if (!apps) return null;
      const query = new URLSearchParams({ apps });
      // V názvu je „+“ mezera (formulářový zápis), v id balíčků ne („Notepad++.Notepad++“)
      const name = params.get("name")?.replace(/\+/g, " ");
      if (name) query.set("name", name);
      return `/bundles/shared?${query}`;
    }
    default:
      return null;
  }
}

/**
 * Parametry odkazu bez převodu „+“ na mezeru (URLSearchParams by z „Notepad++“
 * udělal „Notepad  “) – odkazy z webu „+“ v id balíčků často nekódují.
 */
function queryParams(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of query.split("&")) {
    const [key, ...rest] = part.split("=");
    if (!key) continue;
    try {
      params.set(decodeURIComponent(key), decodeURIComponent(rest.join("=")));
    } catch {
      // Neplatné %xx – parametr vynechat
    }
  }
  return params;
}
