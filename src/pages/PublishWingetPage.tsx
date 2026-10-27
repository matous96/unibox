/**
 * Publikovat → Vytvořit manifest WinGetu. Průvodce pro vývojáře: z adresy
 * instalátoru zjistí SHA-256, typ, architekturu a údaje (services/publish.ts),
 * doplní se popis, z údajů vznikne manifest (lib/wingetManifest.ts), ověří se
 * příkazem `winget validate` a odešle jako pull request do microsoft/winget-pkgs
 * (zdarma, open source) – nebo se uloží a odešle ručně. Po schválení
 * moderátory WinGetu se aplikace objeví v Uniboxu s další aktualizací katalogu.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardCopy, ExternalLink, FolderDown, GitPullRequest, Search, ShieldCheck } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/States";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import {
  cleanProductName,
  emptyManifest,
  manifestFiles,
  manifestPath,
  suggestIdentifier,
  validateManifest,
  type Architecture,
  type InstallerType,
  type ManifestData,
  type ManifestError,
  type ManifestField,
} from "@/lib/wingetManifest";
import {
  analyzeInstaller,
  GITHUB_CLIENT_ID,
  PublishError,
  saveManifestFiles,
  startGitHubLogin,
  submitPullRequest,
  validateManifestFiles,
  waitForGitHubToken,
  type DeviceCode,
  type InstallerAnalysis,
  type SubmitStep,
} from "@/services/publish";
import { useToasts } from "@/store/toasts";

const TYPES: InstallerType[] = ["exe", "inno", "nullsoft", "burn", "msi", "wix", "msix", "zip"];
const ARCHES: Architecture[] = ["x64", "x86", "arm64", "neutral"];
const STEPS: SubmitStep[] = ["account", "check", "fork", "commit", "pullRequest"];

/** Obvyklé přepínače tiché instalace podle typu (u „exe“ je musí doplnit vývojář). */
const SILENT: Partial<Record<InstallerType, string>> = { inno: "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART", nullsoft: "/S" };

const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted focus:border-accent/50 focus:ring-4 focus:ring-accent/15 select-text";

export function PublishWingetPage() {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState<InstallerAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [data, setData] = useState<ManifestData>(emptyManifest);
  const [showErrors, setShowErrors] = useState(false);
  const [validation, setValidation] = useState<{ ok: boolean; output: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [tab, setTab] = useState(0);
  const [submitOpen, setSubmitOpen] = useState(false);

  const errors = useMemo(() => validateManifest(data), [data]);
  const files = useMemo(() => manifestFiles(data), [data]);
  const errorOf = (field: ManifestField) => (showErrors ? errors.find((e) => e.field === field) : undefined);

  // Změna údajů zneplatní předchozí kontrolu
  const update = (changes: Partial<ManifestData>) => {
    setData((d) => ({ ...d, ...changes }));
    setValidation(null);
  };
  const updateInstaller = (changes: Partial<ManifestData["installer"]>) => {
    setData((d) => ({ ...d, installer: { ...d.installer, ...changes } }));
    setValidation(null);
  };

  const analyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await analyzeInstaller(url);
      setAnalysis(result);
      // Předvyplnit, co instalátor prozradil (ručně zadané údaje nepřepisovat)
      setData((d) => {
        const name = d.name || cleanProductName(result.productName ?? "");
        const publisher = d.publisher || result.publisher || "";
        return {
          ...d,
          name,
          publisher,
          version: d.version || result.version || "",
          copyright: d.copyright || result.copyright || "",
          identifier: d.identifier || suggestIdentifier(publisher, name),
          installer: {
            ...d.installer,
            url: url.trim(),
            sha256: result.sha256,
            type: result.installerType,
            architecture: result.architecture,
            productCode: result.productCode ?? "",
            silent: d.installer.silent || SILENT[result.installerType] || "",
          },
        };
      });
      setValidation(null);
    } catch (error) {
      setAnalysis(null);
      setAnalyzeError(String(error));
    } finally {
      setAnalyzing(false);
    }
  };

  const check = async () => {
    setShowErrors(true);
    if (errors.length) {
      toast("error", t("publishWinget.fixErrors", { count: errors.length }));
      return;
    }
    setValidating(true);
    try {
      setValidation(await validateManifestFiles(files));
    } catch (error) {
      setValidation({ ok: false, output: String(error) });
    } finally {
      setValidating(false);
    }
  };

  const save = async () => {
    try {
      const path = await saveManifestFiles(data, files);
      if (path) toast("success", t("publishWinget.saved", { path }));
    } catch (error) {
      toast("error", `${t("publishWinget.saveFailed")} ${String(error)}`);
    }
  };

  if (!isTauri()) {
    return (
      <div>
        <BackLink />
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-700 dark:text-amber-300">{t("publishWinget.desktopOnly")}</p>
      </div>
    );
  }

  const ready = !!analysis && errors.length === 0 && validation?.ok === true;

  return (
    <div className="max-w-4xl">
      <BackLink />
      <h1 className="font-display text-3xl font-bold tracking-tight">{t("publishWinget.title")}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t("publishWinget.intro")}</p>

      {/* 1 – Instalátor */}
      <Step number={1} title={t("publishWinget.step1")} hint={t("publishWinget.step1Hint")}>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void analyze();
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/downloads/app-1.0-x64.exe"
            className={inputClass}
            spellCheck={false}
          />
          <Button type="submit" size="lg" disabled={analyzing || !url.trim()}>
            {analyzing ? <Spinner className="size-4" /> : <Search className="size-4" />}
            {t("publishWinget.analyze")}
          </Button>
        </form>
        {analyzing && <p className="mt-3 text-sm text-muted">{t("publishWinget.analyzing")}</p>}
        {analyzeError && <p className="mt-3 text-sm text-danger">{analyzeError}</p>}
        {analysis && (
          <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-xl bg-surface-2/60 p-4 text-sm sm:grid-cols-2">
            <Fact label={t("publishWinget.file")}>{analysis.fileName}</Fact>
            <Fact label={t("publishWinget.size")}>{(analysis.size / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB</Fact>
            <Fact label={t("publishWinget.type")}>{t(`publishWinget.typeName.${analysis.installerType}`)}</Fact>
            <Fact label={t("publishWinget.architecture")}>
              {analysis.architecture}
              {analysis.architectureSource === "guess" && <span className="ml-2 text-amber-600 dark:text-amber-400">{t("publishWinget.archGuess")}</span>}
            </Fact>
            <Fact label="SHA-256">
              <code className="font-mono text-xs break-all select-text">{analysis.sha256}</code>
            </Fact>
            {analysis.productCode && <Fact label="ProductCode">{analysis.productCode}</Fact>}
          </dl>
        )}
      </Step>

      {/* 2 – Údaje */}
      <Step number={2} title={t("publishWinget.step2")} hint={t("publishWinget.step2Hint")} disabled={!analysis}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("publishWinget.field.name")} error={errorOf("name")}>
            <input className={inputClass} value={data.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label={t("publishWinget.field.publisher")} error={errorOf("publisher")}>
            <input className={inputClass} value={data.publisher} onChange={(e) => update({ publisher: e.target.value })} />
          </Field>
          <Field
            label={t("publishWinget.field.identifier")}
            hint={t("publishWinget.field.identifierHint")}
            error={errorOf("identifier")}
            action={
              suggestIdentifier(data.publisher, data.name) && suggestIdentifier(data.publisher, data.name) !== data.identifier ? (
                <button type="button" className="cursor-pointer text-xs font-semibold text-accent hover:underline" onClick={() => update({ identifier: suggestIdentifier(data.publisher, data.name) })}>
                  {t("publishWinget.suggest", { id: suggestIdentifier(data.publisher, data.name) })}
                </button>
              ) : undefined
            }
          >
            <input className={inputClass} value={data.identifier} onChange={(e) => update({ identifier: e.target.value })} spellCheck={false} />
          </Field>
          <Field label={t("publishWinget.field.version")} error={errorOf("version")}>
            <input className={inputClass} value={data.version} onChange={(e) => update({ version: e.target.value })} spellCheck={false} />
          </Field>
          <Field label={t("publishWinget.field.shortDescription")} hint={t("publishWinget.field.englishHint")} error={errorOf("shortDescription")} wide>
            <input className={inputClass} value={data.shortDescription} maxLength={256} onChange={(e) => update({ shortDescription: e.target.value })} />
          </Field>
          <Field label={t("publishWinget.field.description")} error={errorOf("description")} wide>
            <textarea className={cn(inputClass, "resize-y")} rows={4} value={data.description} onChange={(e) => update({ description: e.target.value })} />
          </Field>
          <Field label={t("publishWinget.field.license")} hint={t("publishWinget.field.licenseHint")} error={errorOf("license")}>
            <input className={inputClass} value={data.license} onChange={(e) => update({ license: e.target.value })} />
          </Field>
          <Field label={t("publishWinget.field.licenseUrl")} error={errorOf("licenseUrl")}>
            <input className={inputClass} value={data.licenseUrl} onChange={(e) => update({ licenseUrl: e.target.value })} spellCheck={false} />
          </Field>
          <Field label={t("publishWinget.field.homepage")} error={errorOf("homepage")}>
            <input className={inputClass} value={data.homepage} onChange={(e) => update({ homepage: e.target.value })} spellCheck={false} />
          </Field>
          <Field label={t("publishWinget.field.publisherUrl")} error={errorOf("publisherUrl")}>
            <input className={inputClass} value={data.publisherUrl} onChange={(e) => update({ publisherUrl: e.target.value })} spellCheck={false} />
          </Field>
          <Field label={t("publishWinget.field.supportUrl")} error={errorOf("supportUrl")}>
            <input className={inputClass} value={data.supportUrl} onChange={(e) => update({ supportUrl: e.target.value })} spellCheck={false} />
          </Field>
          <Field label={t("publishWinget.field.releaseNotesUrl")} error={errorOf("releaseNotesUrl")}>
            <input className={inputClass} value={data.releaseNotesUrl} onChange={(e) => update({ releaseNotesUrl: e.target.value })} spellCheck={false} />
          </Field>
          <Field label={t("publishWinget.field.tags")} hint={t("publishWinget.field.tagsHint")} error={errorOf("tags")}>
            <input
              className={inputClass}
              defaultValue={data.tags.join(", ")}
              onBlur={(e) => update({ tags: e.target.value.split(/[,\s]+/).filter(Boolean) })}
              spellCheck={false}
            />
          </Field>
          <Field label={t("publishWinget.field.moniker")} hint={t("publishWinget.field.monikerHint")} error={errorOf("moniker")}>
            <input className={inputClass} value={data.moniker} onChange={(e) => update({ moniker: e.target.value })} spellCheck={false} />
          </Field>
          <Field label={t("publishWinget.field.copyright")} error={errorOf("copyright")} wide>
            <input className={inputClass} value={data.copyright} onChange={(e) => update({ copyright: e.target.value })} />
          </Field>
        </div>

        <h3 className="mt-6 mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{t("publishWinget.installerTitle")}</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("publishWinget.type")}>
            <select className={inputClass} value={data.installer.type} onChange={(e) => updateInstaller({ type: e.target.value as InstallerType })}>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`publishWinget.typeName.${type}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("publishWinget.architecture")}>
            <select className={inputClass} value={data.installer.architecture} onChange={(e) => updateInstaller({ architecture: e.target.value as Architecture })}>
              {ARCHES.map((arch) => (
                <option key={arch} value={arch}>
                  {arch}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("publishWinget.scope")}>
            <select className={inputClass} value={data.installer.scope} onChange={(e) => updateInstaller({ scope: e.target.value as ManifestData["installer"]["scope"] })}>
              <option value="">{t("publishWinget.scopeAny")}</option>
              <option value="user">{t("publishWinget.scopeUser")}</option>
              <option value="machine">{t("publishWinget.scopeMachine")}</option>
            </select>
          </Field>
          {data.installer.type === "exe" && (
            <>
              <Field label={t("publishWinget.field.silent")} hint={t("publishWinget.field.silentHint")} error={errorOf("silent")}>
                <input className={inputClass} value={data.installer.silent} onChange={(e) => updateInstaller({ silent: e.target.value })} spellCheck={false} />
              </Field>
              <Field label={t("publishWinget.field.silentWithProgress")}>
                <input className={inputClass} value={data.installer.silentWithProgress} onChange={(e) => updateInstaller({ silentWithProgress: e.target.value })} spellCheck={false} />
              </Field>
            </>
          )}
          {(data.installer.type === "msi" || data.installer.type === "wix") && (
            <Field label="ProductCode" error={errorOf("productCode")} wide>
              <input className={inputClass} value={data.installer.productCode} onChange={(e) => updateInstaller({ productCode: e.target.value })} spellCheck={false} />
            </Field>
          )}
          {data.installer.type === "zip" && (
            <>
              <Field label={t("publishWinget.field.nestedFile")} hint={t("publishWinget.field.nestedFileHint")} error={errorOf("nestedFile")}>
                <input className={inputClass} value={data.installer.nestedFile} onChange={(e) => updateInstaller({ nestedFile: e.target.value })} spellCheck={false} />
              </Field>
              <Field label={t("publishWinget.field.commandAlias")} error={errorOf("commandAlias")}>
                <input className={inputClass} value={data.installer.commandAlias} onChange={(e) => updateInstaller({ commandAlias: e.target.value })} spellCheck={false} />
              </Field>
            </>
          )}
        </div>
      </Step>

      {/* 3 – Kontrola */}
      <Step number={3} title={t("publishWinget.step3")} hint={t("publishWinget.step3Hint")} disabled={!analysis}>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={() => void check()} disabled={validating}>
            {validating ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" />}
            {t("publishWinget.validate")}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => void save()} disabled={errors.length > 0}>
            <FolderDown className="size-4" />
            {t("publishWinget.save")}
          </Button>
        </div>
        {showErrors && errors.length > 0 && <ErrorList errors={errors} />}
        {validation && (
          <div
            className={cn(
              "mt-4 rounded-xl border px-4 py-3 text-sm",
              validation.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-danger/30 bg-danger/10 text-danger",
            )}
          >
            <p className="flex items-center gap-2 font-semibold">
              {validation.ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
              {t(validation.ok ? "publishWinget.valid" : "publishWinget.invalid")}
            </p>
            {!validation.ok && <pre className="mt-2 font-mono text-xs whitespace-pre-wrap select-text">{validation.output}</pre>}
          </div>
        )}

        {/* Náhled souborů */}
        <div className="mt-5 overflow-hidden rounded-xl border border-line">
          <div className="flex items-center gap-1 border-b border-line bg-surface-2/60 px-2 py-1.5">
            {files.map((file, i) => (
              <button
                key={file.name}
                type="button"
                onClick={() => setTab(i)}
                className={cn("cursor-pointer rounded-lg px-2.5 py-1 font-mono text-xs", tab === i ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
              >
                {i === 0 ? "version.yaml" : file.name.replace(`${data.identifier.trim()}.`, "")}
              </button>
            ))}
            <button
              type="button"
              className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:text-fg"
              onClick={() => void navigator.clipboard.writeText(files[tab]?.content ?? "").then(() => toast("success", t("publishWinget.copied")))}
            >
              <ClipboardCopy className="size-3.5" />
              {t("publishWinget.copy")}
            </button>
          </div>
          <pre className="max-h-80 overflow-auto bg-surface p-4 font-mono text-xs leading-5 select-text">{files[tab]?.content}</pre>
        </div>
        <p className="mt-2 text-xs text-muted">
          {t("publishWinget.repoPath")} <code className="font-mono select-text">{manifestPath(data)}</code>
        </p>
      </Step>

      {/* 4 – Odeslání */}
      <Step number={4} title={t("publishWinget.step4")} hint={t("publishWinget.step4Hint")} disabled={!analysis}>
        {GITHUB_CLIENT_ID ? (
          <Button size="lg" onClick={() => setSubmitOpen(true)} disabled={!ready}>
            <GitPullRequest className="size-4" />
            {t("publishWinget.submit")}
          </Button>
        ) : (
          <ManualSubmit data={data} />
        )}
        {GITHUB_CLIENT_ID && !ready && <p className="mt-2 text-xs text-muted">{t("publishWinget.submitNeedsValid")}</p>}
        <p className="mt-4 text-sm text-muted">{t("publishWinget.afterSubmit")}</p>
      </Step>

      {GITHUB_CLIENT_ID && <SubmitDialog open={submitOpen} onClose={() => setSubmitOpen(false)} data={data} validated={validation?.ok === true} />}
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link to="/publish" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
      <ArrowLeft className="size-4" />
      {t("publishWinget.back")}
    </Link>
  );
}

function Step({ number, title, hint, disabled, children }: { number: number; title: string; hint: string; disabled?: boolean; children: ReactNode }) {
  return (
    <section className={cn("mt-6 rounded-3xl border border-line bg-surface p-6 shadow-card", disabled && "pointer-events-none opacity-50")} aria-disabled={disabled}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-accent-fg">{number}</span>
        <div>
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  action,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  error?: ManifestError;
  action?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <label className={cn("flex flex-col gap-1.5", wide && "sm:col-span-full")}>
      <span className="flex items-center justify-between gap-2 text-sm font-medium">
        {label}
        {action}
      </span>
      {children}
      {error ? <span className="text-xs text-danger">{t(`publishWinget.error.${error.error}`)}</span> : hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

function ErrorList({ errors }: { errors: ManifestError[] }) {
  const { t } = useTranslation();
  return (
    <ul className="mt-4 flex flex-col gap-1 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {errors.map((e) => (
        <li key={e.field}>
          <strong>{t(`publishWinget.fieldName.${e.field}`)}</strong>: {t(`publishWinget.error.${e.error}`)}
        </li>
      ))}
    </ul>
  );
}

/** Bez aplikace GitHub OAuth: uložit manifest a odeslat ho ručně nebo nástrojem wingetcreate. */
function ManualSubmit({ data }: { data: ManifestData }) {
  const { t } = useTranslation();
  const folder = `${data.identifier.trim() || "Vydavatel.Aplikace"}\\${data.version.trim() || "1.0.0"}`;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>{t("publishWinget.manualIntro")}</p>
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        <li>
          {t("publishWinget.manualWingetcreate")}
          <code className="mt-1 block rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs select-text">winget install Microsoft.WingetCreate</code>
          <code className="mt-1 block rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs select-text">wingetcreate submit "…\{folder}"</code>
        </li>
        <li>
          {t("publishWinget.manualGitHub")}{" "}
          <code className="font-mono text-xs select-text">{manifestPath(data)}</code>
        </li>
      </ol>
      <button
        type="button"
        onClick={() => void openUrl("https://github.com/microsoft/winget-pkgs/blob/master/doc/README.md")}
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 font-semibold text-accent hover:underline"
      >
        {t("publishWinget.manualDocs")}
        <ExternalLink className="size-3.5" />
      </button>
    </div>
  );
}

/** Přihlášení ke GitHubu (kód z prohlížeče) a průběh odeslání pull requestu. */
function SubmitDialog({ open, onClose, data, validated }: { open: boolean; onClose: () => void; data: ManifestData; validated: boolean }) {
  const { t } = useTranslation();
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [step, setStep] = useState<SubmitStep | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const start = async () => {
    setRunning(true);
    setError(null);
    setPrUrl(null);
    setStep(null);
    abort.current = new AbortController();
    try {
      const device = await startGitHubLogin();
      setCode(device);
      void openUrl(device.verificationUri);
      const token = await waitForGitHubToken(device, abort.current.signal);
      setCode(null);
      setPrUrl(await submitPullRequest(token, data, manifestFiles(data), validated, setStep));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof PublishError && e.reason !== "github" ? t(`publishWinget.submitError.${e.reason}`) : `${t("publishWinget.submitError.github")} ${String((e as Error).message ?? e)}`);
    } finally {
      setRunning(false);
    }
  };

  const close = () => {
    abort.current?.abort();
    setCode(null);
    setStep(null);
    setError(null);
    setPrUrl(null);
    setRunning(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t("publishWinget.submit")}
      className="max-w-lg"
      footer={
        prUrl ? (
          <Button onClick={() => void openUrl(prUrl)}>
            <ExternalLink className="size-4" />
            {t("publishWinget.openPr")}
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={running}>
            {running ? <Spinner className="size-4" /> : <GitPullRequest className="size-4" />}
            {t("publishWinget.signInAndSubmit")}
          </Button>
        )
      }
    >
      <p className="text-sm text-muted">{t("publishWinget.submitExplain", { path: manifestPath(data) })}</p>
      {code && (
        <div className="mt-4 rounded-xl bg-surface-2 p-4 text-center">
          <p className="text-sm">{t("publishWinget.enterCode")}</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-[0.2em] select-text">{code.userCode}</p>
          <button type="button" onClick={() => void openUrl(code.verificationUri)} className="mt-2 cursor-pointer text-sm font-semibold text-accent hover:underline">
            {code.verificationUri}
          </button>
        </div>
      )}
      {step && (
        <ol className="mt-4 flex flex-col gap-1.5 text-sm">
          {STEPS.map((s) => {
            const done = prUrl !== null || STEPS.indexOf(s) < STEPS.indexOf(step);
            const current = !prUrl && s === step;
            return (
              <li key={s} className={cn("flex items-center gap-2", !done && !current && "text-muted")}>
                {done ? <Check className="size-4 text-emerald-500" /> : current ? <Spinner className="size-4" /> : <span className="size-4" />}
                {t(`publishWinget.submitStep.${s}`)}
              </li>
            );
          })}
        </ol>
      )}
      {prUrl && <p className="mt-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400">{t("publishWinget.submitted")}</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
