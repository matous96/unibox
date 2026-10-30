/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL vzdáleného catalog.json; bez ní se použije přibalená kopie. */
  readonly VITE_CATALOG_URL?: string;
  /** Odkaz na repozitář projektu na GitHubu. */
  readonly VITE_GITHUB_URL?: string;
  /** Odkaz na dobrovolný příspěvek (revolut.me) – karta Podpořit HubGet v Nastavení. */
  readonly VITE_SUPPORT_URL?: string;
  /** Kontaktní e-mail projektu. */
  readonly VITE_CONTACT_EMAIL?: string;
  /** Fórum komunity. */
  readonly VITE_FORUM_URL?: string;
  /** Web projektu pro sdílené odkazy na aplikace. */
  readonly VITE_SHARE_URL?: string;
  /** Adresa projektu Supabase (https://<projekt>.supabase.co) – přihlášení a hodnocení. */
  readonly VITE_SUPABASE_URL?: string;
  /** Veřejný klíč projektu Supabase (publishable / anon key – patří do aplikace, data chrání RLS). */
  readonly VITE_SUPABASE_KEY?: string;
  /** Přihlášení zapnuté v Supabase, čárkami (github, google); výchozí obě. */
  readonly VITE_AUTH_PROVIDERS?: string;
  /** client_id bezplatné aplikace GitHub OAuth (Device Flow) – odeslání manifestu do winget-pkgs. */
  readonly VITE_GITHUB_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
