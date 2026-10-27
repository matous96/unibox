/**
 * Adresy ikon přes protokol icon:// (Rust, icons.rs) – samostatný modul, ať je
 * může použít lib/icons.ts i store/iconQuality.ts bez kruhového importu.
 */
import { isTauri } from "./tauri";

/** Protokol icon:// ve WebView2 (Windows). */
export const ICON_HOST = "http://icon.localhost";

/** Adresa ikony z internetu – v desktopové aplikaci přes mezipaměť na disku. */
export const remoteIconSrc = (url: string) => (isTauri() ? `${ICON_HOST}/remote?u=${encodeURIComponent(url)}` : url);

/** Ikona nainstalované aplikace z nabídky Start (jen desktop). */
export const appIconSrc = (appId: string) => `${ICON_HOST}/app?id=${encodeURIComponent(appId)}`;

/** Ikona programu ze seznamu Po spuštění (jen desktop, jen programy z posledního výpisu). */
export const fileIconSrc = (path: string) => `${ICON_HOST}/file?p=${encodeURIComponent(path)}`;
