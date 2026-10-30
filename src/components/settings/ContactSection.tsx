import { CircleCheck, ImagePlus, Loader2, Lock, Send, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { GITHUB_URL } from "@/config";
import { LANGUAGES } from "@/i18n";
import { SCREENSHOT_TYPES } from "@/lib/screenshotImage";
import { getSystemInfo, isTestBuild, type SystemInfo } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import {
  ContactError,
  contactConfigured,
  contactImagesAvailable,
  sendContactMessage,
  type ContactErrorKind,
} from "@/services/contact";
import { APP_VERSION } from "@/services/updates";
import { useAuth } from "@/store/auth";
import { CONTACT_MAX_IMAGES, CONTACT_TOPICS, useContact } from "@/store/contact";
import { useSettings } from "@/store/settings";
import { useToasts } from "@/store/toasts";
import { Card, Switch } from "./SettingsUi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 5000;

/** Chyby bez odkazu (failed má odkaz na GitHub). */
const ERROR_KEYS: Record<Exclude<ContactErrorKind, "failed">, string> = {
  offline: "contact.errorOffline",
  rateLimit: "contact.errorRateLimit",
  imagesLimit: "contact.errorImagesLimit",
  imagesFailed: "contact.errorImagesFailed",
};

const fieldClass =
  "mt-1.5 w-full rounded-xl border bg-surface-2 px-3.5 py-2.5 text-sm outline-none transition-shadow select-text placeholder:text-muted focus:ring-4";
const fieldState = (invalid: boolean) =>
  invalid ? "border-danger/60 focus:border-danger/60 focus:ring-danger/15" : "border-line focus:border-accent/50 focus:ring-accent/15";

/**
 * Kontaktovat HubGet: dotaz, chyba, nápad nebo spolupráce. Zpráva odejde přes Web3Forms
 * e-mailem autorovi, odpověď přijde na e-mail z formuláře (přihlášenému se předvyplní z účtu).
 * Technické údaje se přikládají viditelně a jdou vypnout. Snímky obrazovky (jen přihlášení)
 * jdou do Supabase Storage a do e-mailu odkaz. Rozepsaná zpráva je ve store contact
 * – vydrží přechod na jinou stránku a nahlášení aplikace ji umí předvyplnit.
 */
export function ContactSection() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const user = useAuth((s) => s.user);
  const openLogin = useAuth((s) => s.openLogin);
  const { topic, name, email, message, attachInfo, images, update, clearMessage } = useContact();
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<ContactErrorKind | null>(null);
  // Chyby polí až po prvním pokusu o odeslání, ne už při psaní
  const [validate, setValidate] = useState(false);
  const configured = contactConfigured();

  useEffect(() => {
    void getSystemInfo().then(setSystem);
  }, []);

  // Přihlášený uživatel: jméno a e-mail z účtu, pokud je ještě nevyplnil sám
  useEffect(() => {
    if (!user) return;
    const draft = useContact.getState();
    draft.update({ name: draft.name || user.name, email: draft.email || user.email });
  }, [user]);

  const emailOk = EMAIL_RE.test(email.trim());
  const messageOk = message.trim().length >= MIN_MESSAGE;
  const preparing = images.some((i) => !i.image);

  const details = [
    `HubGet ${APP_VERSION}${isTestBuild() ? " (test)" : ""}`,
    system &&
      `${system.osName}${system.osDisplayVersion ? ` ${system.osDisplayVersion}` : ""} (${system.osBuild}), ${system.arch}`,
    `${t("contact.diagLanguage")}: ${LANGUAGES.find((l) => l.code === language)?.label ?? language}`,
  ].filter(Boolean) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailOk || !messageOk) {
      setValidate(true);
      return;
    }
    // Snímky nahraje jen přihlášený (mezitím se mohl odhlásit)
    if (images.length > 0 && !user) {
      openLogin("screenshot");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendContactMessage({
        topic,
        name,
        email,
        message,
        details: attachInfo ? details : [],
        images: images.flatMap((i) => (i.image ? [i.image] : [])),
      });
      setSentTo(email.trim());
      setValidate(false);
      clearMessage();
    } catch (err) {
      console.error("Zprávu z kontaktního formuláře se nepodařilo odeslat:", err);
      setError(err instanceof ContactError ? err.kind : "failed");
    } finally {
      setSending(false);
    }
  };

  const github = <a href={`${GITHUB_URL}/issues/new`} target="_blank" rel="noreferrer" className="font-semibold underline-offset-2 hover:underline" />;

  if (sentTo) {
    return (
      <Card>
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success/12 text-success">
            <CircleCheck className="size-7" />
          </span>
          <h3 className="mt-4 font-display text-xl font-bold">{t("contact.sentTitle")}</h3>
          <p className="mt-1 text-sm text-muted">{t("contact.sentText", { email: sentTo })}</p>
          <Button variant="secondary" className="mt-6" onClick={() => setSentTo(null)}>
            {t("contact.another")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="px-4 py-4">
        <p className="text-sm text-muted">{t("contact.intro")}</p>

        {/* Sestavení bez přístupového klíče: formulář jde vyplnit, ale ne odeslat (odkaz na GitHub) */}
        {!configured && (
          <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <Trans i18nKey="contact.notConfigured" components={{ github }} />
            </span>
          </p>
        )}

        {/* Téma */}
        <p className="mt-5 text-sm font-medium" id="contact-topic">
          {t("contact.topic")}
        </p>
        <div role="radiogroup" aria-labelledby="contact-topic" className="mt-1.5 flex flex-wrap gap-1.5">
          {CONTACT_TOPICS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={topic === id}
              onClick={() => update({ topic: id })}
              className={cn(
                "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                topic === id ? "border-accent/50 bg-accent/10 text-accent" : "border-line text-fg/80 hover:bg-surface-2 hover:text-fg",
              )}
            >
              {t(`contact.topics.${id}`)}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="contact-name" label={t("contact.name")} optional={t("contact.optional")}>
            <input
              id="contact-name"
              value={name}
              onChange={(e) => update({ name: e.target.value })}
              autoComplete="name"
              maxLength={100}
              className={cn(fieldClass, fieldState(false))}
            />
          </Field>
          <Field id="contact-email" label={t("contact.email")} error={validate && !emailOk ? t("contact.emailInvalid") : null}>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => update({ email: e.target.value })}
              autoComplete="email"
              maxLength={200}
              spellCheck={false}
              aria-invalid={validate && !emailOk}
              className={cn(fieldClass, fieldState(validate && !emailOk))}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field id="contact-message" label={t("contact.message")} error={validate && !messageOk ? t("contact.messageShort") : null}>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => update({ message: e.target.value })}
              placeholder={t("contact.messagePlaceholder")}
              rows={7}
              maxLength={MAX_MESSAGE}
              aria-invalid={validate && !messageOk}
              className={cn(fieldClass, "resize-y", fieldState(validate && !messageOk))}
            />
          </Field>
          {/* Počet znaků až u konce limitu */}
          {message.length > MAX_MESSAGE * 0.8 && (
            <p className="mt-1 text-right text-xs text-muted tabular-nums">
              {message.length} / {MAX_MESSAGE}
            </p>
          )}
        </div>

        {contactImagesAvailable() && <ContactImages disabled={sending} />}

        {/* Přiložené údaje – viditelně, ať uživatel ví, co se odešle */}
        <div className="mt-4 flex items-start justify-between gap-4 rounded-xl bg-surface-2/60 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("contact.attach")}</p>
            <p className="mt-0.5 text-xs text-muted">{t("contact.attachHint")}</p>
            {attachInfo && (
              <ul className="mt-2 font-mono text-[11px] leading-5 text-muted select-text">
                {details.map((d) => (
                  <li key={d} className="truncate">
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Switch checked={attachInfo} onChange={(value) => update({ attachInfo: value })} label={t("contact.attach")} />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error === "failed" ? <Trans i18nKey="contact.errorFailed" components={{ github }} /> : t(ERROR_KEYS[error])}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted">
            <Lock className="mt-px size-3.5 shrink-0" />
            {t("contact.privacy")}
          </p>
          <Button type="submit" size="lg" disabled={!configured || sending || preparing}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t(sending ? "contact.sending" : "contact.send")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Snímky obrazovky ke zprávě: výběr, přetažení nebo vložení ze schránky (Ctrl+V – třeba hned
 * po Win+Shift+S). Nahrát je smí jen přihlášený, nepřihlášenému se nabídne přihlášení.
 */
function ContactImages({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const openLogin = useAuth((s) => s.openLogin);
  const toast = useToasts((s) => s.push);
  const { images, addImages, removeImage } = useContact();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = images.length >= CONTACT_MAX_IMAGES;

  const add = (files: File[]) => {
    if (!user) return openLogin("screenshot");
    addImages(files, (problem, file) => toast("error", t(`appScreenshots.problem.${problem}`, { file })));
  };

  // Vložení ze schránky kdekoli na stránce (textové vložení do polí nechá být)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length === 0 || disabled || full) return;
      e.preventDefault();
      add(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  return (
    <div className="mt-4">
      <p className="text-sm font-medium">
        {t("contact.images")}
        <span className="ml-1.5 text-xs font-normal text-muted">({t("contact.optional")})</span>
      </p>

      {user ? (
        <button
          type="button"
          disabled={full || disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!full && !disabled) add([...e.dataTransfer.files]);
          }}
          className={cn(
            "mt-1.5 flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line px-4 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/5",
            dragging && "border-accent bg-accent/10",
            (full || disabled) && "cursor-default opacity-60 hover:border-line hover:bg-transparent",
          )}
        >
          <ImagePlus className="size-6 shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block text-sm">{t("contact.imagesChoose")}</span>
            <span className="block text-xs text-muted">{t("contact.imagesHint")}</span>
          </span>
        </button>
      ) : (
        <div className="mt-1.5 flex items-center gap-3 rounded-xl border-2 border-dashed border-line px-4 py-3">
          <ImagePlus className="size-6 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 text-sm text-muted">{t("contact.imagesLogin")}</span>
          <Button variant="secondary" size="sm" onClick={() => openLogin("screenshot")}>
            {t("auth.signIn")}
          </Button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={SCREENSHOT_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {images.length > 0 && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {images.map((item) => (
              <div key={item.key} className="relative aspect-[16/10] overflow-hidden rounded-xl border border-line bg-surface-2">
                {item.preview ? (
                  <img src={item.preview} alt={item.name} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-muted" />
                  </span>
                )}
                <button
                  type="button"
                  aria-label={t("appScreenshots.remove")}
                  title={t("appScreenshots.remove")}
                  disabled={disabled}
                  onClick={() => removeImage(item.key)}
                  className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{t("appScreenshots.privacy")}</p>
        </>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && <span className="ml-1.5 text-xs font-normal text-muted">({optional})</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
