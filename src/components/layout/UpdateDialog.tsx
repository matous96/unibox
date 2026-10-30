/**
 * Dialog „Je k dispozici nová verze HubGetu“ – otevře ho kontrola při
 * spuštění nebo ruční kontrola (nabídka ⋯, Nastavení). Nabízí aktualizaci,
 * odložení a přeskočení verze; během instalace ukazuje průběh stažení.
 */
import { AlertTriangle, Download, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAppUpdate } from "@/store/appUpdate";
import { useSettings } from "@/store/settings";

export function UpdateDialog() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const { update, dialogOpen, installing, progress, error, install, later, skip } = useAppUpdate();
  if (!update) return null;

  const date = update.date ? new Date(update.date.replace(" ", "T")) : null;

  return (
    <Modal
      open={dialogOpen}
      onClose={installing ? () => {} : later}
      title={t("appUpdate.title")}
      className="max-w-lg"
      footer={
        installing ? null : (
          <>
            <Button variant="secondary" onClick={skip}>
              {t("appUpdate.skip")}
            </Button>
            <Button variant="secondary" onClick={later}>
              {t("appUpdate.later")}
            </Button>
            <Button onClick={() => void install()}>
              <Download className="size-4" />
              {t("appUpdate.install")}
            </Button>
          </>
        )
      }
    >
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <Sparkles className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px]">{t("appUpdate.question", { version: update.version, current: update.currentVersion })}</p>
          {date && !Number.isNaN(date.getTime()) && (
            <p className="mt-1 text-xs text-muted">
              {t("appUpdate.released", { date: date.toLocaleDateString(language, { day: "numeric", month: "long", year: "numeric" }) })}
            </p>
          )}
        </div>
      </div>

      {update.body && (
        <div className="mt-4 max-h-48 overflow-y-auto rounded-xl bg-surface-2 px-4 py-3 text-sm whitespace-pre-line select-text">{update.body}</div>
      )}

      {installing && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium">
            {progress !== null && progress < 100
              ? t("appUpdate.downloading", { percent: Math.round(progress) })
              : t("appUpdate.installing")}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress ?? 100}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p>{t("appUpdate.failed")}</p>
            {/* Podrobnost od updateru (síť, podpis…) – podle ní jde chybu dohledat */}
            <p className="mt-1 text-xs break-words opacity-80 select-text">{error}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
