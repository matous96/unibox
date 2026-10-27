/**
 * Snímky obrazovky aplikací od uživatelů.
 *
 * Katalog má snímky jen z komunitních databází a bývají staré. Přihlášený uživatel
 * proto může k aplikaci nahrát aktuální snímek: aplikace ho zmenší do WebP
 * (lib/screenshotImage.ts), databáze založí záznam s cestou a limity
 * (supabase/migrations/…_app_screenshots.sql) a soubor jde do soukromého bucketu
 * app-screenshots v Supabase Storage. Ostatní ho uvidí po schválení správcem;
 * zobrazují se přes podepsané adresy s omezenou platností. Nahlášený snímek
 * (3×) databáze skryje. UI pracuje jen s rozhraním AppScreenshotsService.
 *
 * Bez Supabase zůstává ukázková implementace v paměti (jen pro vyzkoušení
 * rozhraní ve vývoji – viz ratingsEnabled).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PreparedScreenshot } from "@/lib/screenshotImage";
import type { ReportReason } from "./reviews";
import { supabase } from "./supabase";

export interface CommunityScreenshot {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  /** Jméno autora z přihlášení (GitHub / Google). */
  author: string;
  date: string;
  /** Schválený správcem – ostatní ho vidí. */
  approved: boolean;
  /** Snímek aktuálního uživatele. */
  mine: boolean;
  /** Aktuální uživatel snímek nahlásil. */
  reported: boolean;
  /** Cesty v úložišti (smazání). */
  path: string;
  thumbPath: string;
}

/** Proč nahrání neprošlo: limit snímků (4 u aplikace, 20 celkem), nebo jiná chyba. */
export class AppScreenshotUploadError extends Error {
  constructor(
    readonly reason: "limit" | "failed",
    /** Kolik snímků se před chybou nahrálo. */
    readonly uploaded: number,
    cause?: unknown,
  ) {
    super(`Nahrání snímku selhalo (${reason})`, { cause });
  }
}

/** Kolik snímků smí mít uživatel u jedné aplikace (stejný limit hlídá databáze). */
export const SCREENSHOTS_PER_APP = 4;

export interface AppScreenshotsService {
  readonly isSample: boolean;
  /** Vlastní (i čekající na schválení) a schválené snímky aplikace, vlastní první. */
  list(appId: string): Promise<CommunityScreenshot[]>;
  /** Nahraje snímky; vrátí, jestli jsou hned veřejné (jinak čekají na schválení). */
  upload(appId: string, shots: PreparedScreenshot[]): Promise<{ published: boolean }>;
  /** Smaže vlastní snímek (soubory i záznam). */
  remove(shot: CommunityScreenshot): Promise<void>;
  /** Nahlásí cizí snímek (opakované nahlášení nic nezmění). */
  report(id: string, reason: ReportReason): Promise<void>;
}

// ── Ukázková implementace ────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sampleStore = new Map<string, CommunityScreenshot[]>();

export const mockAppScreenshotsService: AppScreenshotsService = {
  isSample: true,

  async list(appId) {
    await sleep(150);
    return [...(sampleStore.get(appId) ?? [])];
  },

  async upload(appId, shots) {
    await sleep(500);
    const own = sampleStore.get(appId) ?? [];
    if (own.length + shots.length > SCREENSHOTS_PER_APP) throw new AppScreenshotUploadError("limit", 0);
    const added = shots.map((shot) => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(shot.full),
      thumbUrl: URL.createObjectURL(shot.thumb),
      width: shot.width,
      height: shot.height,
      author: "",
      date: new Date().toISOString(),
      approved: false,
      mine: true,
      reported: false,
      path: "",
      thumbPath: "",
    }));
    sampleStore.set(appId, [...added.reverse(), ...own]);
    return { published: false };
  },

  async remove(shot) {
    await sleep(200);
    for (const [appId, list] of sampleStore) sampleStore.set(appId, list.filter((s) => s.id !== shot.id));
    URL.revokeObjectURL(shot.url);
    URL.revokeObjectURL(shot.thumbUrl);
  },

  async report() {
    await sleep(200);
  },
};

// ── Supabase ─────────────────────────────────────────────────────────────

const BUCKET = "app-screenshots";
/** Platnost podepsaných adres (dotaz se obnoví dřív – staleTime v UI). */
const SIGNED_URL_SECONDS = 60 * 60;
/** Chyba Postgresu „unikátní klíč už existuje“ – snímek už uživatel nahlásil. */
const UNIQUE_VIOLATION = "23505";
/** Chyba z kontroly limitu v databázi (trigger app_screenshots_before_insert). */
const CHECK_VIOLATION = "23514";

/** Řádek z funkce app_screenshots_list() – bez user_id. */
interface ScreenshotRow {
  id: string;
  path: string;
  thumb_path: string;
  width: number;
  height: number;
  author: string;
  created_at: string;
  approved: boolean;
  mine: boolean;
  reported: boolean;
}

export function supabaseAppScreenshotsService(client: SupabaseClient): AppScreenshotsService {
  const storage = () => client.storage.from(BUCKET);

  return {
    isSample: false,

    async list(appId) {
      const { data, error } = await client.rpc("app_screenshots_list", { p_app_id: appId });
      if (error) throw error;
      const rows = data as ScreenshotRow[];
      if (rows.length === 0) return [];
      // Podepsané adresy jen k souborům, které smí uživatel číst (pravidla v Storage)
      const signed = await storage().createSignedUrls(
        rows.flatMap((r) => [r.path, r.thumb_path]),
        SIGNED_URL_SECONDS,
      );
      if (signed.error) throw signed.error;
      const urls = new Map(signed.data.filter((s) => s.signedUrl && !s.error).map((s) => [s.path, s.signedUrl]));
      return rows
        .filter((r) => urls.has(r.path) && urls.has(r.thumb_path)) // soubor se ještě nahrává nebo chybí
        .map((r) => ({
          id: r.id,
          url: urls.get(r.path)!,
          thumbUrl: urls.get(r.thumb_path)!,
          width: r.width,
          height: r.height,
          author: r.author,
          date: r.created_at,
          approved: r.approved,
          mine: r.mine,
          reported: r.reported,
          path: r.path,
          thumbPath: r.thumb_path,
        }));
    },

    async upload(appId, shots) {
      let published = false;
      for (const [i, shot] of shots.entries()) {
        // Záznam založí databáze (kontrola limitů, cesta bez user_id), pak soubory k němu
        const { data: row, error } = await client
          .from("app_screenshots")
          .insert({ app_id: appId, width: shot.width, height: shot.height })
          .select("id, path, thumb_path, approved")
          .single<{ id: string; path: string; thumb_path: string; approved: boolean }>();
        if (error) throw new AppScreenshotUploadError(error.code === CHECK_VIOLATION ? "limit" : "failed", i, error);
        published = row.approved;
        try {
          for (const [path, blob] of [[row.path, shot.full], [row.thumb_path, shot.thumb]] as const) {
            const { error: uploadError } = await storage().upload(path, blob, {
              contentType: "image/webp",
              cacheControl: "31536000",
              upsert: false,
            });
            if (uploadError) throw uploadError;
          }
        } catch (uploadError) {
          // Nedokončený snímek uklidit, ať nezabírá limit
          await storage().remove([row.path, row.thumb_path]);
          await client.from("app_screenshots").delete().eq("id", row.id);
          throw new AppScreenshotUploadError("failed", i, uploadError);
        }
      }
      return { published };
    },

    async remove(shot) {
      // Nejdřív soubory (pravidlo smazání podle vlastníka souboru), pak záznam
      const removed = await storage().remove([shot.path, shot.thumbPath]);
      if (removed.error) throw removed.error;
      const { error } = await client.from("app_screenshots").delete().eq("id", shot.id);
      if (error) throw error;
    },

    async report(id, reason) {
      const { error } = await client.from("app_screenshot_reports").insert({ screenshot_id: id, reason });
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },
  };
}

/** Vybraná implementace: Supabase, je-li nastavený, jinak ukázková. */
export const appScreenshots: AppScreenshotsService = supabase
  ? supabaseAppScreenshotsService(supabase)
  : mockAppScreenshotsService;
