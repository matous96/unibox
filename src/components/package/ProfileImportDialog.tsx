/**
 * Dialog po importu profilu počítače: kolik aplikací profil obsahuje a kolik
 * jich tu ještě chybí, převzetí nastavení (ignorované a automatické
 * aktualizace) a „Nainstalovat vše“ – chybějící aplikace se zařadí do fronty
 * a průběh je vidět v Sadách balíčků.
 */
import { Check, Download, ListChecks, Settings2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { fallbackEntry, useCatalogIndex, useInstalledIndex } from "@/hooks/usePackages";
import { cn } from "@/lib/utils";
import { getSource } from "@/services/managers";
import { useBundle } from "@/store/bundle";
import { useJobs } from "@/store/jobs";
import { applyProfileConfig, useProfileImport } from "@/store/profileImport";
import { useToasts } from "@/store/toasts";
import { PackageIcon } from "./PackageIcon";

export function ProfileImportDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToasts((s) => s.push);
  const { pending, close } = useProfileImport();
  const installedIndex = useInstalledIndex();
  const catalogIndex = useCatalogIndex();
  const enqueue = useJobs((s) => s.enqueue);
  const loadBundle = useBundle((s) => s.load);
  const [withSettings, setWithSettings] = useState(true);
  if (!pending) return null;

  const missing = pending.packages.filter((p) => !installedIndex.has(p.appId));
  const settingsCount = Object.keys(pending.config?.pins ?? {}).length + (pending.config?.autoUpdate?.length ?? 0);

  /** Načte profil do Sad balíčků, převezme nastavení a případně zařadí instalaci. */
  const finish = (install: boolean) => {
    loadBundle(pending);
    const applied = withSettings && pending.config ? applyProfileConfig(pending.config) : 0;
    if (applied) toast("info", t("profileImport.settingsApplied", { count: applied }));
    if (install) {
      const { jobs } = useJobs.getState();
      const todo = missing.filter((p) => !jobs[p.appId]);
      for (const p of todo) {
        enqueue({ appId: p.appId, appName: p.name, source: p.source, packageId: p.packageId, kind: "install", version: p.version, options: p.options });
      }
      toast(todo.length ? "success" : "info", todo.length ? t("bundles.queued", { count: todo.length }) : t("bundles.nothingToInstall"));
    } else {
      toast("success", t("profile.imported", { count: pending.packages.length }));
    }
    close();
    navigate("/bundles");
  };

  return (
    <Modal
      open
      onClose={close}
      title={t("profileImport.title")}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t("package.cancel")}
          </Button>
          <Button variant="secondary" onClick={() => finish(false)}>
            <ListChecks className="size-4" />
            {t("profileImport.review")}
          </Button>
          <Button onClick={() => finish(true)} disabled={!missing.length} autoFocus>
            <Download className="size-4" />
            {t("profileImport.installAll", { count: missing.length })}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        {pending.name && <span className="font-semibold text-fg">{pending.name} · </span>}
        {t("profileImport.summary", { count: pending.packages.length, missing: missing.length })}
      </p>

      <ul className="mt-4 flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
        {pending.packages.map((p) => {
          const entry = catalogIndex.get(p.appId) ?? fallbackEntry(p.source, p.packageId, p.name, p.version ?? "");
          const installed = installedIndex.has(p.appId);
          return (
            <li key={p.appId} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2/60">
              <PackageIcon id={entry.id} name={entry.name} iconUrl={entry.iconUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.name}</p>
                <p className="truncate text-xs text-muted">
                  {getSource(p.source).label} · {p.packageId}
                </p>
              </div>
              <span className={cn("shrink-0 text-xs", installed ? "inline-flex items-center gap-1 font-semibold text-success" : "text-muted")}>
                {installed && <Check className="size-3.5" />}
                {installed ? t("package.installed") : t("profileImport.willInstall")}
              </span>
            </li>
          );
        })}
      </ul>

      {settingsCount > 0 && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
          <input
            type="checkbox"
            checked={withSettings}
            onChange={(e) => setWithSettings(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Settings2 className="size-4 text-muted" />
              {t("profileImport.applySettings")}
            </span>
            <span className="text-xs text-muted">{t("profileImport.applySettingsHint", { count: settingsCount })}</span>
          </span>
        </label>
      )}
    </Modal>
  );
}
