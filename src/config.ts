/**
 * Odkazy na komunitu projektu. Hodnoty lze přepsat v souboru .env.local
 * (VITE_GITHUB_URL, VITE_DISCORD_URL).
 *
 * TODO: doplnit skutečné adresy, až bude repozitář a Discord server založený.
 */
export const GITHUB_URL: string = import.meta.env.VITE_GITHUB_URL ?? "https://github.com/matous96/unibox";
export const DISCORD_URL: string = import.meta.env.VITE_DISCORD_URL ?? "https://discord.gg/YOUR-INVITE";
/** Fórum komunity – výchozí jsou diskuze (Discussions) v repozitáři na GitHubu. */
export const FORUM_URL: string = import.meta.env.VITE_FORUM_URL ?? `${GITHUB_URL}/discussions`;
/** Kontaktní e-mail projektu (ikona obálky v horní liště). */
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL ?? "YOUR-EMAIL@example.com";

/**
 * Webová adresa pro sdílené odkazy (např. https://vas-web.cz). Volitelná:
 * bez ní se sdílí odkaz unibox://, který otevře aplikaci přímo v Uniboxu,
 * a na sociální sítě se přiloží web aplikace.
 */
export const SHARE_WEB_URL: string | null = import.meta.env.VITE_SHARE_URL ?? null;

/** Odkaz, který otevře detail aplikace přímo v Uniboxu (obsluhuje tauri-plugin-deep-link). */
export const appDeepLink = (appId: string) => `unibox://app/${encodeURIComponent(appId)}`;

/** Webový odkaz na aplikaci, pokud je nastavený web projektu. */
export const appWebLink = (appId: string) =>
  SHARE_WEB_URL ? `${SHARE_WEB_URL.replace(/\/$/, "")}/app/${encodeURIComponent(appId)}` : null;

/**
 * Odkaz na sdílenou sadu balíčků (data sady jsou přímo v odkazu):
 *  - s webem projektu: …/bundle?d=… (web ho přesměruje do aplikace),
 *  - v desktopové aplikaci: unibox://bundle?d=… (otevře Unibox přes deep link),
 *  - ve webové verzi pro vývoj: adresa této stránky.
 */
export function bundleShareLink(data: string): string {
  if (SHARE_WEB_URL) return `${SHARE_WEB_URL.replace(/\/$/, "")}/bundle?d=${data}`;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) return `unibox://bundle?d=${data}`;
  return `${window.location.origin}${window.location.pathname}#/bundles/shared?d=${data}`;
}

/** Formulář pro návrh nového zdroje balíčků (nové issue na GitHubu). */
export const NEW_SOURCE_URL = `${GITHUB_URL}/issues/new?title=${encodeURIComponent("Nový zdroj balíčků: ")}&labels=new-source`;
