/**
 * Přihlášení uživatele.
 *
 * Skutečná implementace přes Supabase Auth (services/supabase.ts):
 *  - OAuth 2.0 s PKCE v systémovém prohlížeči (GitHub / Google),
 *  - návrat do aplikace na http://127.0.0.1:<port>/auth/callback
 *    (src-tauri/src/oauth.rs), ve webové verzi zpět na stránku,
 *  - relace šifrovaná Windows DPAPI (src-tauri/src/secure_store.rs), ne v localStorage.
 * Aplikace tak nikdy nevidí heslo uživatele.
 *
 * Bez nastaveného Supabase se použije ukázková implementace, která přihlášení
 * jen simuluje (UI to viditelně označí).
 */
import type { SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/tauri";
import { supabase } from "./supabase";

export type AuthProvider = "github" | "microsoft" | "google";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  provider: AuthProvider;
}

export interface AuthService {
  /** true = přihlášení se jen simuluje (UI to viditelně označí). */
  readonly isSample: boolean;
  /** Poskytovatelé, u kterých se jde přihlásit (tlačítka v dialogu). */
  readonly providers: AuthProvider[];
  /** Uložená relace z minula, pokud existuje. */
  getSession(): Promise<User | null>;
  /** Spustí přihlášení u zvoleného poskytovatele. */
  signIn(provider: AuthProvider): Promise<User>;
  /** Zruší probíhající přihlášení (uživatel zavřel dialog) – signIn skončí SignInCancelled. */
  cancelSignIn(): void;
  signOut(): Promise<void>;
  /** Změny přihlášení mimo signIn / signOut (obnovení tokenu, vypršení relace). */
  subscribe(listener: (user: User | null) => void): void;
}

/** Přihlášení zrušené uživatelem – nezobrazuje se jako chyba. */
export class SignInCancelled extends Error {}

// ── Ukázková implementace ────────────────────────────────────────────────

const SESSION_KEY = "unibox-session";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ukázkové profily – jasně smyšlené, aby nebylo možné je zaměnit se skutečným účtem. */
const SAMPLE_USERS: Record<AuthProvider, Omit<User, "provider">> = {
  github: { id: "sample-gh-1", name: "Ukázkový uživatel", email: "ukazka@example.com", avatarUrl: null },
  microsoft: { id: "sample-ms-1", name: "Ukázkový uživatel", email: "ukazka@example.com", avatarUrl: null },
  google: { id: "sample-gg-1", name: "Ukázkový uživatel", email: "ukazka@example.com", avatarUrl: null },
};

export const mockAuthService: AuthService = {
  isSample: true,
  providers: ["github", "microsoft", "google"],

  async getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },

  async signIn(provider) {
    await sleep(1200); // simulace návratu z prohlížeče
    const user: User = { ...SAMPLE_USERS[provider], provider };
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return user;
  },

  cancelSignIn() {},

  async signOut() {
    await sleep(200);
    localStorage.removeItem(SESSION_KEY);
  },

  subscribe() {},
};

// ── Supabase Auth ────────────────────────────────────────────────────────

/** Parametry návratu z prohlížeče (src-tauri/src/oauth.rs). */
interface OAuthCallback {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
}

/** Profil z Supabase: jméno a avatar dodá GitHub / Google v user_metadata. */
function toUser(user: SupabaseUser): User {
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const provider = user.app_metadata?.provider;
  return {
    id: user.id,
    name: meta.full_name || meta.name || meta.user_name || user.email?.split("@")[0] || "?",
    email: user.email ?? "",
    avatarUrl: meta.avatar_url || meta.picture || null,
    provider: provider === "google" || provider === "github" ? provider : "github",
  };
}

/** Poskytovatelé zapnutí v Supabase – VITE_AUTH_PROVIDERS (např. „github“), výchozí GitHub i Google. */
function enabledProviders(): AuthProvider[] {
  const listed = (import.meta.env.VITE_AUTH_PROVIDERS ?? "").split(",").map((p) => p.trim().toLowerCase());
  const known = listed.filter((p): p is AuthProvider => p === "github" || p === "google");
  return known.length ? known : ["github", "google"];
}

export function supabaseAuthService(client: SupabaseClient): AuthService {
  let cancelled = false;

  return {
    isSample: false,
    providers: enabledProviders(),

    async getSession() {
      const { data } = await client.auth.getSession();
      return data.session ? toUser(data.session.user) : null;
    },

    async signIn(provider) {
      if (provider === "microsoft") throw new Error("Přihlášení přes Microsoft není nastavené");
      cancelled = false;

      // Webová verze: přesměrování k poskytovateli a zpět, relaci převezme supabase-js z adresy
      if (!isTauri()) {
        const { error } = await client.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
        });
        if (error) throw error;
        return new Promise<User>(() => {}); // stránka právě odchází k poskytovateli
      }

      // Desktop: přihlášení v systémovém prohlížeči, návrat na 127.0.0.1
      const port = await invoke<number>("oauth_listen");
      const { data, error } = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `http://127.0.0.1:${port}/auth/callback`, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        void invoke("oauth_cancel");
        throw error ?? new Error("Supabase nevrátil adresu přihlášení");
      }
      await openUrl(data.url);

      let callback: OAuthCallback;
      try {
        callback = await invoke<OAuthCallback>("oauth_wait");
      } catch (e) {
        if (cancelled || e === "cancelled") throw new SignInCancelled();
        throw new Error(String(e));
      }
      if (!callback.code) throw new Error(callback.errorDescription ?? callback.error ?? "Přihlášení se nepovedlo");

      // Jednorázový kód + ověřovač PKCE uložený při signInWithOAuth → relace
      const exchanged = await client.auth.exchangeCodeForSession(callback.code);
      if (exchanged.error) throw exchanged.error;
      return toUser(exchanged.data.user);
    },

    cancelSignIn() {
      cancelled = true;
      if (isTauri()) void invoke("oauth_cancel");
    },

    async signOut() {
      // Jen na tomto zařízení – přihlášení na ostatních zůstane
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    },

    subscribe(listener) {
      client.auth.onAuthStateChange((_event, session) => listener(session ? toUser(session.user) : null));
    },
  };
}

/** Vybraná implementace: Supabase, je-li nastavený, jinak ukázková. */
export const auth: AuthService = supabase ? supabaseAuthService(supabase) : mockAuthService;
