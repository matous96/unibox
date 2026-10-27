/**
 * Dialog po odinstalaci: zbytky, které aplikace nechala – složky v AppData,
 * s pokročilou odinstalací i složky v Program Files a ProgramData, zástupci
 * a klíče registru. Vše je předvybrané; soubory a složky jdou do Koše
 * (obnovitelné), klíče registru se před smazáním zálohují. Položky se štítem
 * vyžadují práva správce (Windows se zeptá jednou pro všechny).
 */
import { Check, File, FolderOpen, KeyRound, Power, ScanSearch, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn, formatSizeText } from "@/lib/utils";
import { useLeftovers, type Leftover } from "@/store/leftovers";
import { useSettings } from "@/store/settings";
import { useToasts } from "@/store/toasts";

const KIND_ICON = { folder: FolderOpen, file: File, registry: KeyRound, value: Power } as const;

/** Hodnota v klíči Run („HKCU\…\Run|Discord“) jako „HKCU\…\Run → Discord“. */
const displayPath = (item: Leftover) => (item.kind === "value" ? item.path.replace(/\|(?=[^|]*$)/, " → ") : item.path);

export function LeftoversDialog() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const toast = useToasts((s) => s.push);
  const { pending, remove, dismiss } = useLeftovers();
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(pending);

  // Nový nález = vše znovu vybrané (úprava stavu během renderu, bez efektu)
  if (pending !== shown) {
    setShown(pending);
    setUnchecked(new Set());
  }
  if (!pending) return null;

  const chosen = pending.items.filter((i) => !unchecked.has(i.path));
  const total = chosen.reduce((sum, i) => sum + i.size, 0);
  const files = pending.items.filter((i) => i.kind === "folder" || i.kind === "file");
  const keys = pending.items.filter((i) => i.kind === "registry" || i.kind === "value");
  const toggle = (path: string) => {
    const next = new Set(unchecked);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setUnchecked(next);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await remove(chosen.map((i) => i.path));
      const left = result.failed.length + result.needsAdmin.length;
      if (result.removed.length) toast("success", t("leftovers.removedItems", { count: result.removed.length, size: formatSizeText(total, language) }));
      if (result.needsAdmin.length) toast("error", t("leftovers.needsAdmin", { count: result.needsAdmin.length }));
      else if (left) toast("error", t("leftovers.partlyFailed", { count: left }));
      if (result.backup) toast("info", t("leftovers.backupSaved", { folder: result.backup }));
    } catch {
      toast("error", t("leftovers.failed"));
    } finally {
      setBusy(false);
    }
  };

  const row = (item: Leftover) => {
    const checked = !unchecked.has(item.path);
    const Icon = KIND_ICON[item.kind];
    return (
      <li key={item.path}>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => toggle(item.path)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
              checked ? "border-accent bg-accent text-accent-fg" : "border-muted/50",
            )}
          >
            {checked && <Check className="size-3.5" strokeWidth={3} />}
          </span>
          <Icon className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs select-text" title={displayPath(item)}>
            {displayPath(item)}
          </span>
          {item.admin && (
            <span title={t("leftovers.adminItem")} className="shrink-0">
              <ShieldAlert className="size-4 text-amber-500 dark:text-amber-400" aria-label={t("leftovers.adminItem")} />
            </span>
          )}
          <span className="shrink-0 text-xs text-muted tabular-nums">
            {item.kind === "value"
              ? t("leftovers.startupValue")
              : item.kind === "registry"
              ? t("leftovers.values", { count: item.files })
              : `${formatSizeText(item.size, language)} · ${t("leftovers.files", { count: item.files })}`}
          </span>
        </button>
      </li>
    );
  };

  return (
    <Modal
      open
      onClose={dismiss}
      title={t("leftovers.title", { name: pending.appName })}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={dismiss} disabled={busy}>
            {t("leftovers.keep")}
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={busy || !chosen.length}>
            <Trash2 className="size-4" />
            {t("leftovers.removeChosen", { count: chosen.length, size: formatSizeText(total, language) })}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{t(pending.deep ? "leftovers.textDeep" : "leftovers.text")}</p>
      {pending.traced > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent/10 px-3 py-2 text-xs">
          <ScanSearch className="mt-px size-4 shrink-0 text-accent" />
          {t("leftovers.tracedNote", { count: pending.traced })}
        </p>
      )}
      {files.length > 0 && (
        <>
          {keys.length > 0 && <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">{t("leftovers.groupFiles")}</h3>}
          <ul className="mt-2 flex flex-col gap-1.5">{files.map(row)}</ul>
        </>
      )}
      {keys.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">{t("leftovers.groupRegistry")}</h3>
          <ul className="mt-2 flex flex-col gap-1.5">{keys.map(row)}</ul>
          <p className="mt-3 text-xs text-muted">{t("leftovers.registryBackup")}</p>
        </>
      )}
      {pending.items.some((i) => i.admin) && <p className="mt-2 text-xs text-muted">{t("leftovers.adminNote")}</p>}
    </Modal>
  );
}
