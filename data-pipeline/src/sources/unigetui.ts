/**
 * Komunitní databáze ikon a screenshotů projektu UniGetUI (MIT, Devolutions):
 * jeden soubor JSON, klíčem je zjednodušené id balíčku („vlc“, „firefox“,
 * „obs-studio“, „notepadplusplus“…). Obrázky se jen odkazují, nekopírují.
 */
import { MAX_AGE, UNIGETUI_SCREENSHOTS_URL } from "../config.ts";
import { fetchJson } from "../lib/http.ts";
import { log } from "../lib/log.ts";

interface UnigetDatabase {
  icons_and_screenshots?: Record<string, { icon?: string; images?: string[] }>;
}

/** Ikony a screenshoty podle klíče (jen položky, které je mají). */
export interface UnigetData {
  icons: Map<string, string>;
  screenshots: Map<string, string[]>;
}

export async function loadUnigetData(): Promise<UnigetData> {
  const data: UnigetData = { icons: new Map(), screenshots: new Map() };
  try {
    const db = await fetchJson<UnigetDatabase>(UNIGETUI_SCREENSHOTS_URL, { maxAge: MAX_AGE.unigetui });
    for (const [rawKey, value] of Object.entries(db?.icons_and_screenshots ?? {})) {
      const key = rawKey.toLowerCase();
      if (typeof value.icon === "string" && value.icon.trim()) data.icons.set(key, value.icon.trim());
      const images = (value.images ?? []).filter((u) => typeof u === "string" && u.trim());
      if (images.length) data.screenshots.set(key, images);
    }
    log.info(`UniGetUI: ikony u ${data.icons.size} balíčků, screenshoty u ${data.screenshots.size}`);
  } catch (e) {
    // Bez nich se katalog sestaví i tak
    log.warn(`UniGetUI: databázi ikon a screenshotů se nepodařilo načíst (${e instanceof Error ? e.message : e})`);
  }
  return data;
}

/**
 * Klíče, pod kterými může být aplikace v databázi UniGetUI: id z Chocolatey
 * (bez .install / .portable), název ze Scoopu, id wingetu bez vydavatele
 * („VideoLAN.VLC“ → „vlc“) a název aplikace („OBS Studio“ → „obs-studio“, „obsstudio“).
 */
export function unigetKeys(ids: { chocolatey?: string; scoop?: string; winget?: string }, name: string): string[] {
  const keys: string[] = [];
  const add = (key: string | undefined) => {
    const k = key?.toLowerCase().trim();
    if (k && !keys.includes(k)) keys.push(k);
  };
  add(ids.chocolatey?.replace(/\.(install|portable|app)$/i, ""));
  add(ids.scoop?.split("/").pop());
  if (ids.winget) {
    const tail = ids.winget.split(".").slice(1).join(".");
    add(tail);
    add(tail.replace(/\./g, "-"));
  }
  const lower = name.toLowerCase();
  add(lower.replace(/[^a-z0-9+]+/g, "-").replace(/^-+|-+$/g, ""));
  add(lower.replace(/[^a-z0-9]+/g, ""));
  return keys;
}
