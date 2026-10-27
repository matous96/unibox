import { Check, Copy, ShieldUser } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { resolveInstallOptions } from "@/lib/installArgs";
import { cn } from "@/lib/utils";
import { downloadCommand, getSource, unattendedInstallCommand } from "@/services/managers";
import { installFlags, useInstallOptions } from "@/store/installOptions";
import { useInstallUi } from "@/store/installUi";
import { useToasts } from "@/store/toasts";

/**
 * Dialog Ruční instalace: příkazy pro všechny zdroje aplikace (s uloženými
 * volbami instalace) ke zkopírování do terminálu, u podporovaných správců
 * i příkaz pro stažení instalátoru.
 */
export function ManualInstallDialog() {
  const { t } = useTranslation();
  const { manual, closeManual } = useInstallUi();
  const saved = useInstallOptions((s) => (manual ? s.byApp[manual.entry.id] : undefined));
  const entry = manual?.entry;
  const flags = installFlags(saved);
  const needsAdmin = !!entry && (saved?.asAdmin || entry.sources.some((s) => getSource(s.source).needsAdmin));

  return (
    <Modal open={!!manual} onClose={closeManual} title={entry ? t("manual.title", { name: entry.name }) : ""} className="max-w-2xl">
      {entry && (
        <div className="flex flex-col gap-4">
          <p className="-mt-2 text-sm text-muted">{t("manual.intro")}</p>

          {entry.sources.map((s) => {
            const meta = getSource(s.source);
            // Uložená verze platí jen pro uložený zdroj
            const version = saved?.version && saved.source === s.source ? saved.version : undefined;
            const download = meta.options.download ? downloadCommand(s.source, s.packageId, version, flags) : null;
            return (
              <div key={s.source} className={cn("rounded-2xl border p-3", manual?.source === s.source ? "border-accent/30 bg-accent/5" : "border-line")}>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <span className={cn("size-2 rounded-full", meta.dot)} />
                  {meta.label}
                  {meta.needsAdmin && <span className="text-xs font-normal text-muted">{t("settings.needsAdmin")}</span>}
                </p>
                <CopyCommand command={unattendedInstallCommand(s.source, s.packageId, version, resolveInstallOptions(entry, s, flags))} />
                {download && (
                  <div className="mt-2">
                    <p className="mb-1 text-xs text-muted">{t("manual.downloadOnly")}</p>
                    <CopyCommand command={download} />
                  </div>
                )}
              </div>
            );
          })}

          {needsAdmin && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <ShieldUser className="size-4 shrink-0" />
              {t("manual.adminHint")}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Příkaz v neproporcionálním písmu s tlačítkem Kopírovat. */
export function CopyCommand({ command }: { command: string }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      toast("error", t("common.error"));
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 font-mono text-[13px] break-all select-text">{command}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
          copied ? "bg-success/15 text-success" : "bg-surface text-fg hover:bg-surface-3",
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? t("package.copiedShort") : t("package.copy")}
      </button>
    </div>
  );
}
