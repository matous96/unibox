/**
 * Odeslání zprávy z kontaktního formuláře přes Web3Forms (zdarma, zpráva přijde e-mailem
 * autorovi a „Odpovědět“ míří na e-mail odesílatele). API se volá přímo z okna aplikace –
 * volání ze serveru služba odmítá a přístupový klíč je veřejný.
 */
import i18n from "@/i18n";
import { CONTACT_FORM_KEY } from "@/config";
import type { ContactTopic } from "@/store/contact";

const ENDPOINT = "https://api.web3forms.com/submit";

export type ContactErrorKind = "offline" | "rateLimit" | "failed";

export class ContactError extends Error {
  constructor(
    readonly kind: ContactErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
  }
}

/** Je formulář v této verzi nastavený (sestavení s přístupovým klíčem)? */
export const contactConfigured = () => CONTACT_FORM_KEY !== "";

export async function sendContactMessage(msg: {
  topic: ContactTopic;
  name: string;
  email: string;
  message: string;
  /** Technické údaje (verze, systém, jazyk) – prázdné, když je uživatel nepřiložil. */
  details: string[];
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
