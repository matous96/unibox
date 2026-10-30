import { CircleCheck, Loader2, Lock, Send, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { GITHUB_URL } from "@/config";
import { LANGUAGES } from "@/i18n";
import { getSystemInfo, isTestBuild, type SystemInfo } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { ContactError, contactConfigured, sendContactMessage, type ContactErrorKind } from "@/services/contact";
import { APP_VERSION } from "@/services/updates";
import { useAuth } from "@/store/auth";
import { CONTACT_TOPICS, useContact } from "@/store/contact";
import { useSettings } from "@/store/settings";
import { Card, Switch } from "./SettingsUi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 5000;

const fieldClass =
  "mt-1.5 w-full rounded-xl border bg-surface-2 px-3.5 py-2.5 text-sm outline-none transition-shadow select-text placeholder:text-muted focus:ring-4";
const fieldState = (invalid: boolean) =>
  invalid ? "border-danger/60 focus:border-danger/60 focus:ring-danger/15" : "border-line focus:border-accent/50 focus:ring-accent/15";

/**
 * Kontaktovat HubGet: dotaz, chyba, nápad nebo spolupráce. Zpráva odejde přes Web3Forms
 * e-mailem autorovi, odpověď přijde na e-mail z formuláře (přihlášenému se předvyplní z účtu).
 * Technické údaje se přikládají viditelně a jdou vypnout. Rozepsaná zpráva je ve store contact
 * – vydrží přechod na jinou stránku a nahlášení aplikace ji umí předvyplnit.
 */
export function ContactSection() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const user = useAuth((s) => s.user);
  const { topic, name, email, message, attachInfo, update, clearMessage } = useContact();
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
    setSending(true);
    setError(null);
    try {
      await sendContactMessage({ topic, name, email, message, details: attachInfo ? details : [] });
      setSentTo(email.trim());
      setValidate(false);
      clearMessage();
    } catch (err) {
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
            {error === "failed" ? (
              <Trans i18nKey="contact.errorFailed" components={{ github }} />
            ) : (
              t(error === "offline" ? "contact.errorOffline" : "contact.errorRateLimit")
            )}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted">
            <Lock className="mt-px size-3.5 shrink-0" />
            {t("contact.privacy")}
          </p>
          <Button type="submit" size="lg" disabled={!configured || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t(sending ? "contact.sending" : "contact.send")}
          </Button>
        </div>
      </form>
    </Card>
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
