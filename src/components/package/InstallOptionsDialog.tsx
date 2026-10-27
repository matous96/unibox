import { useQuery } from "@tanstack/react-query";
import { RotateCcw, ShieldUser, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { queryKeys } from "@/app/queryClient";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/CollectionToolbar";
import { Modal } from "@/components/ui/Modal";
import { useEffectiveSource } from "@/hooks/usePackages";
import { resolveInstallOptions } from "@/lib/installArgs";
import { cn } from "@/lib/utils";
import { getSource, managers, sourceCommand } from "@/services/managers";
import { installFlags, packageIdFor, useInstallOptions, type SavedInstallOptions } from "@/store/installOptions";
import { useInstallUi } from "@/store/installUi";
import { useJobs } from "@/store/jobs";
import { useSecurity } from "@/store/security";
import { useSettings } from "@/store/settings";
import { useSourceScope } from "@/store/sourceLock";
import { useToasts } from "@/store/toasts";
import type { Arch, CatalogEntry, InstallScope, SourceId } from "@/types";
import { hasInstallParameters, InstallParameters } from "./InstallParameters";
import { CopyCommand } from "./ManualInstallDialog";

/** Dialog Možnosti instalace – jeden pro celou aplikaci (stav v useInstallUi). */
export function InstallOptionsDialog() {
  const { t } = useTranslation();
  const { options, closeOptions } = useInstallUi();
  return (
    <Modal
      open={!!options}
      onClose={closeOptions}
      title={options ? t("installOptions.title", { name: options.entry.name }) : ""}
      className="max-w-xl"
    >
      {options && <OptionsForm key={options.entry.id} entry={options.entry} initialSource={options.source} onDone={closeOptions} />}
    </Modal>
  );
}

/**
 * Formulář voleb instalace: zdroj, verze, architektura, rozsah, jako správce,
 * interaktivně, bez kontrolního součtu, umístění a vlastní parametry.
 * Nabízí jen volby, které zvolený správce podporuje, a ukazuje výsledný příkaz.
 */
function OptionsForm({ entry, initialSource, onDone }: { entry: CatalogEntry; initialSource?: SourceId; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const enabledSources = useSettings((s) => s.enabledSources);
  const { lock } = useSourceScope();
  const language = useSettings((s) => s.language);
  const { byApp, save, reset } = useInstallOptions();
  const enqueue = useJobs((s) => s.enqueue);
  const [draft, setDraft] = useState<SavedInstallOptions>(() => ({ ...byApp[entry.id], source: byApp[entry.id]?.source ?? initialSource }));

  const pkg = useEffectiveSource(entry, draft.source);
  const meta = pkg ? getSource(pkg.source) : undefined;
  const support = meta?.options;
  const set = (patch: Partial<SavedInstallOptions>) => setDraft((d) => ({ ...d, ...patch }));
  // Nebezpečná nastavení (Nastavení → Oprávnění správce)
  const { allowCustomArgs, allowPrePostCommands, elevationProhibited } = useSecurity();

  // Při změně zdroje zahodit verzi (jiný správce má jiné verze)
  useEffect(() => {
    if (pkg && draft.source && draft.source !== pkg.source) set({ source: pkg.source });
  }, [pkg, draft.source]);

  const { data: versions } = useQuery({
    queryKey: queryKeys.versions(pkg?.source ?? "", pkg?.packageId ?? ""),
    queryFn: () => managers[pkg!.source].getVersions(pkg!.packageId),
    enabled: !!pkg && !!meta?.supportsVersions,
    staleTime: 10 * 60_000,
  });

  if (!pkg || !meta || !support) return <p className="py-6 text-center text-sm text-muted">{t("installOptions.noSource")}</p>;

  // Architektury podle zdroje (když je katalog zná), jinak všechny
  const archs: Arch[] = pkg.architectures?.length ? pkg.architectures : ["x64", "x86", "arm64"];
  const flags = installFlags({ ...draft, source: undefined, version: undefined });
  // Do příkazu se promítnou i části instalátoru (PATH, zástupci) a „bez restartu“
  const resolved = resolveInstallOptions(entry, pkg, flags);
  // Varianta balíčku wingetu (jazyk, typ instalátoru), jinak základní balíček
  const packageId = packageIdFor(pkg, draft);
  const command = sourceCommand(pkg.source, "install", packageId, draft.version, resolved);

  const persist = () => save(entry.id, { ...draft, source: pkg.source });
  const install = () => {
    persist();
    enqueue({ appId: entry.id, appName: entry.name, source: pkg.source, packageId, kind: "install", version: draft.version, options: resolved });
    onDone();
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="-mt-2 text-sm text-muted">{t("installOptions.subtitle")}</p>

      {/* Zdroj a verze */}
      <Field label={t("installOptions.source")}>
        <div className="flex flex-wrap gap-1.5">
          {/* Při zamčeném zdroji (levý panel) jen on */}
          {entry.sources.filter((s) => !lock || s.source === lock).map((s) => {
            const enabled = enabledSources.includes(s.source);
            const active = s.source === pkg.source;
            return (
              <button
                key={s.source}
                type="button"
                disabled={!enabled}
                aria-pressed={active}
                onClick={() => set({ source: s.source, version: undefined })}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  active ? "border-accent/40 bg-accent/12 text-accent" : "border-line bg-surface text-fg hover:bg-surface-2",
                )}
              >
                <span className={cn("size-2 rounded-full", getSource(s.source).dot)} />
                {getSource(s.source).label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Jazykové verze a jiné typy instalátoru téže aplikace (winget) */}
      {pkg.source === "winget" && pkg.variants && pkg.variants.length > 0 && (
        <Field label={t("installOptions.variant")} hint={t("installOptions.variantHint")}>
          <select
            value={packageId === pkg.packageId ? "" : packageId}
            onChange={(e) => set({ variant: e.target.value || undefined, version: undefined })}
            className="h-9 w-72 cursor-pointer rounded-lg border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent/50"
          >
            <option value="">{t("installOptions.variantDefault", { id: pkg.packageId })}</option>
            {pkg.variants.map((v) => (
              <option key={v.packageId} value={v.packageId}>
                {variantLabel(v.code, language, t)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {meta.supportsVersions && (
        <Field label={t("installOptions.version")}>
          <select
            value={draft.version ?? ""}
            onChange={(e) => set({ version: e.target.value || undefined })}
            className="h-9 w-56 cursor-pointer rounded-lg border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent/50"
          >
            <option value="">{t("installOptions.latest", { version: pkg.version })}</option>
            {(versions ?? []).slice(1).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      )}

      {support.architecture && (
        <Field label={t("installOptions.architecture")} fit>
          <Segmented<Arch | "">
            value={draft.architecture ?? ""}
            onChange={(v) => set({ architecture: v || undefined })}
            options={[{ value: "", label: t("installOptions.default") }, ...archs.map((a) => ({ value: a, label: a === "arm64" ? "ARM64" : a }))]}
          />
        </Field>
      )}

      {support.scope && (
        <Field label={t("installOptions.scope")} fit>
          <Segmented<InstallScope | "">
            value={draft.scope ?? ""}
            onChange={(v) => set({ scope: v || undefined })}
            options={[
              { value: "", label: t("installOptions.default") },
              { value: "user", label: t("installOptions.scopeUser") },
              { value: "machine", label: t("installOptions.scopeMachine") },
            ]}
          />
        </Field>
      )}

      {/* Přepínače */}
      <div className="flex flex-col gap-1 rounded-2xl border border-line p-1.5">
        <Toggle
          checked={!!draft.asAdmin && !elevationProhibited}
          onChange={(v) => set({ asAdmin: v })}
          title={t("installOptions.asAdmin")}
          hint={elevationProhibited ? t("installOptions.asAdminProhibited") : t("installOptions.asAdminHint")}
          disabled={elevationProhibited}
        />
        {support.interactive && (
          <Toggle checked={!!draft.interactive} onChange={(v) => set({ interactive: v })} title={t("installOptions.interactive")} hint={t("installOptions.interactiveHint")} />
        )}
        {support.skipHash && (
          <Toggle
            checked={!!draft.skipHash}
            onChange={(v) => set({ skipHash: v })}
            title={t("installOptions.skipHash")}
            hint={t("installOptions.skipHashHint")}
            danger
          />
        )}
      </div>
      {draft.skipHash && (
        <p className="-mt-3 flex gap-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
          <TriangleAlert className="size-4 shrink-0" />
          {t("installOptions.skipHashWarning")}
        </p>
      )}

      {/* PATH, zástupci, bez restartu – podle instalátoru zvoleného zdroje */}
      {hasInstallParameters(entry, pkg) && (
        <Field label={t("installParams.title")}>
          <InstallParameters entry={entry} pkg={pkg} options={draft} onChange={set} />
        </Field>
      )}

      {support.location && (
        <Field label={t("installOptions.location")}>
          <TextInput value={draft.location ?? ""} onChange={(v) => set({ location: v || undefined })} placeholder="C:\Program Files\…" />
        </Field>
      )}
      {/* Vlastní argumenty a příkazy před / po instalaci jen s povolením v Nastavení → Oprávnění správce */}
      {support.customArgs &&
        (allowCustomArgs ? (
          <Field label={t("installOptions.customArgs")} hint={t("installOptions.customArgsHint")}>
            <TextInput value={draft.customArgs ?? ""} onChange={(v) => set({ customArgs: v || undefined })} placeholder="/NORESTART" />
          </Field>
        ) : (
          <p className="-mt-2 text-xs text-muted">{t("installOptions.customArgsDisabled")}</p>
        ))}
      {allowPrePostCommands && (
        <>
          <Field label={t("installOptions.preCommand")} hint={t("installOptions.preCommandHint")}>
            <TextInput value={draft.preCommand ?? ""} onChange={(v) => set({ preCommand: v || undefined })} placeholder="taskkill /IM app.exe" />
          </Field>
          <Field label={t("installOptions.postCommand")} hint={t("installOptions.postCommandHint")}>
            <TextInput value={draft.postCommand ?? ""} onChange={(v) => set({ postCommand: v || undefined })} placeholder="echo Hotovo" />
          </Field>
        </>
      )}

      {/* Při aktualizaci: uložené volby platí i pro aktualizace (po vzoru UniGetUI), navíc tyto */}
      <Field label={t("installOptions.updateTitle")} hint={t("installOptions.updateHint")}>
        {support.uninstallPrevious && (
          <div className="rounded-2xl border border-line p-1.5">
            <Toggle
              checked={!!draft.uninstallPrevious}
              onChange={(v) => set({ uninstallPrevious: v || undefined })}
              title={t("installOptions.uninstallPrevious")}
              hint={t("installOptions.uninstallPreviousHint")}
            />
          </div>
        )}
        {support.customArgs && allowCustomArgs && (
          <div className={cn(support.uninstallPrevious && "mt-3")}>
            <p className="mb-1.5 text-xs font-medium text-muted">{t("installOptions.updateArgs")}</p>
            <TextInput value={draft.updateArgs ?? ""} onChange={(v) => set({ updateArgs: v || undefined })} placeholder={t("installOptions.updateArgsPlaceholder")} />
          </div>
        )}
      </Field>

      {/* Výsledný příkaz */}
      <Field label={t("installOptions.preview")}>
        <CopyCommand command={command} />
        {draft.asAdmin && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <ShieldUser className="size-3.5" />
            {t("manual.adminHint")}
          </p>
        )}
      </Field>

      <div className="-mx-6 -mb-5 flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
        <button
          type="button"
          onClick={() => {
            reset(entry.id);
            setDraft({ source: pkg.source });
          }}
          className="mr-auto inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          <RotateCcw className="size-3.5" />
          {t("installOptions.reset")}
        </button>
        <Button variant="secondary" onClick={onDone}>
          {t("package.cancel")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            persist();
            toast("success", t("installOptions.saved", { name: entry.name }));
            onDone();
          }}
        >
          {t("installOptions.save")}
        </Button>
        <Button onClick={install}>{t("installMenu.install")}</Button>
      </div>
    </div>
  );
}

/** Popisek varianty: jazyk podle systému názvů jazyků („Čeština (cs)“), jinak typ instalátoru („Instalátor MSI“). */
function variantLabel(code: string, language: string, t: (key: string, options?: Record<string, string>) => string): string {
  if (/^[A-Z]+$/.test(code)) return t("installOptions.variantInstaller", { type: code });
  try {
    const name = new Intl.DisplayNames([language], { type: "language" }).of(code);
    return name && name !== code ? `${name.charAt(0).toUpperCase()}${name.slice(1)} (${code})` : code;
  } catch {
    return code;
  }
}

/** Popisek s ovládacím prvkem; `fit` = prvek jen na šířku obsahu (přepínače). */
function Field({ label, hint, fit, children }: { label: string; hint?: string; fit?: boolean; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {fit ? <div className="flex">{children}</div> : children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className="h-9 w-full rounded-lg border border-line bg-surface-2 px-3 font-mono text-sm outline-none placeholder:text-muted/60 focus:border-accent/50"
    />
  );
}

function Toggle({
  checked,
  onChange,
  title,
  hint,
  danger,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-2", disabled && "cursor-not-allowed opacity-60")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={cn("size-4 shrink-0", danger ? "accent-[var(--danger)]" : "accent-[var(--accent)]")}
      />
      <span className="min-w-0">
        <span className={cn("block text-sm font-medium", danger && checked && "text-danger")}>{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
