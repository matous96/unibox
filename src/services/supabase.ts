/**
 * Klient Supabase – přihlášení (GitHub, Google) a hodnocení aplikací.
 *
 * Nastavení v .env.local (viz README → Přihlášení a hodnocení):
 *   VITE_SUPABASE_URL=https://<projekt>.supabase.co
 *   VITE_SUPABASE_KEY=<publishable / anon key>
 * Veřejný klíč do aplikace patří – data v databázi chrání pravidla RLS
 * (supabase/migrations). Bez nastavení je `supabase` null a aplikace používá
 * ukázkové přihlášení a hodnocení nezobrazuje.
 *
 * V desktopové aplikaci se relace (tokeny, ověřovač PKCE) ukládá šifrovaně
 * přes Windows DPAPI (src-tauri/src/secure_store.rs), ne do localStorage.
 */
import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/tauri";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_KEY;

/** Úložiště relace v desktopové aplikaci: soubory šifrované klíčem účtu Windows. */
const secureStorage: SupportedStorage = {
  getItem: (key) => invoke<string | null>("secure_get", { key }),
  setItem: (key, value) => invoke<void>("secure_set", { key, value }),
  removeItem: (key) => invoke<void>("secure_remove", { key }),
};

export const supabase: SupabaseClient | null =
  URL && KEY
    ? createClient(URL, KEY, {
        auth: {
          // Návrat z přihlášení s jednorázovým kódem (PKCE) – bezpečné i pro aplikace bez serveru
          flowType: "pkce",
          storage: isTauri() ? secureStorage : undefined,
          persistSession: true,
          autoRefreshToken: true,
          // Desktop kód z návratové adresy předá sám (src-tauri/src/oauth.rs), web ho najde v adrese
          detectSessionInUrl: !isTauri(),
        },
      })
    : null;
