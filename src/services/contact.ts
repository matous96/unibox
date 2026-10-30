/**
 * Odeslání zprávy z kontaktního formuláře přes Web3Forms (zdarma, zpráva přijde e-mailem
 * autorovi a „Odpovědět“ míří na e-mail odesílatele). API se volá přímo z okna aplikace –
 * volání ze serveru služba odmítá a přístupový klíč je veřejný.
 *
 * Snímky obrazovky (přílohy má Web3Forms jen placené) jdou do soukromého bucketu
 * contact-attachments v Supabase Storage – jen pro přihlášené, s denním limitem
 * (supabase/migrations/…_contact_attachments.sql). Do e-mailu jde podepsaný odkaz.
 */
import i18n from "@/i18n";
import { CONTACT_FORM_KEY } from "@/config";
import type { ContactTopic } from "@/store/contact";
import { supabase } from "./supabase";

const ENDPOINT = "https://api.web3forms.com/submit";
const BUCKET = "contact-attachments";
/** Platnost odkazu na snímek v e-mailu; pak zůstane jen ve Storage. */
const LINK_SECONDS = 90 * 24 * 60 * 60;
/** Chyba z kontroly denního limitu v databázi (trigger contact_attachments_before_insert). */
const CHECK_VIOLATION = "23514";

export type ContactErrorKind = "offline" | "rateLimit" | "failed" | "imagesLimit" | "imagesFailed";

export class ContactError extends Error {
  constructor(
    readonly kind: ContactErrorKind,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message ?? kind, options);
  }
}

/** Je formulář v této verzi nastavený (sestavení s přístupovým klíčem)? */
export const contactConfigured = () => CONTACT_FORM_KEY !== "";

/** Jdou přikládat snímky (sestavení se Supabase; nahrát je smí jen přihlášený)? */
export const contactImagesAvailable = () => supabase !== null;

/** Nahraje snímky (WebP) a vrátí podepsané odkazy na ně. */
async function uploadImages(images: Blob[]): Promise<string[]> {
  if (!supabase) throw new ContactError("imagesFailed", "Supabase není nastavený");
  const client = supabase;
  const links: string[] = [];
  for (const image of images) {
    // Záznam založí databáze (denní limit, cesta bez user_id), pak soubor k němu
    const { data: row, error } = await client
      .from("contact_attachments")
      .insert({ user_id: (await client.auth.getSession()).data.session?.user.id })
      .select("id, path")
      .single<{ id: string; path: string }>();
    if (error) throw new ContactError(error.code === CHECK_VIOLATION ? "imagesLimit" : "imagesFailed", error.message, { cause: error });
    const storage = client.storage.from(BUCKET);
    const uploaded = await storage.upload(row.path, image, { contentType: "image/webp", upsert: false });
    if (uploaded.error) throw new ContactError("imagesFailed", uploaded.error.message, { cause: uploaded.error });
    const signed = await storage.createSignedUrl(row.path, LINK_SECONDS);
    if (signed.error) throw new ContactError("imagesFailed", signed.error.message, { cause: signed.error });
    links.push(signed.data.signedUrl);
  }
  return links;
}

export async function sendContactMessage(msg: {
  topic: ContactTopic;
  name: string;
  email: string;
  message: string;
  /** Technické údaje (verze, systém, jazyk) – prázdné, když je uživatel nepřiložil. */
  details: string[];
  /** Snímky obrazovky připravené ve WebP (lib/screenshotImage). */
  images: Blob[];
}): Promise<void> {
  // E-mail čte autor – téma a popisky polí vždy česky, bez ohledu na jazyk aplikace
  const topic = i18n.getFixedT("cs")(`contact.topics.${msg.topic}`);
  const name = msg.name.trim();
  const body: Record<string, string> = {
    access_key: CONTACT_FORM_KEY,
    subject: `HubGet: ${topic}${name ? ` – ${name}` : ""}`,
    from_name: "HubGet",
    name: name || "—",
    email: msg.email.trim(),
    Téma: topic,
    message: msg.message.trim(),
  };
  if (msg.images.length) body["Snímky obrazovky (odkazy platí 90 dní)"] = (await uploadImages(msg.images)).join("\n\n");
  if (msg.details.length) body["Technické údaje"] = msg.details.join("\n");

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      // JSON, ne formulář – na x-www-form-urlencoded služba odpoví přesměrováním (CORS chyba)
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ContactError("offline");
  }
  if (response.status === 429) throw new ContactError("rateLimit");
  const result = (await response.json().catch(() => null)) as { success?: boolean; message?: string } | null;
  if (!response.ok || !result?.success) throw new ContactError("failed", result?.message ?? `HTTP ${response.status}`);
}
