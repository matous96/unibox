/**
 * Lišta pod horní lištou v režimu jednoho zdroje (levý panel → WinGet,
 * Chocolatey, Scoop, npm…): jasně říká, že katalog je filtrovaný, a jedním
 * klikem se vrací k zobrazení všech zdrojů. Stav: store/sourceLock.ts.
 */
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInstallableStats } from "@/hooks/usePackages";
import { cn, formatAppCount } from "@/lib/utils";
import { getSource } from "@/services/managers";
import { useSettings } from "@/store/settings";
import { isDevLock, useSourceLock, useSourceScope } from "@/store/sourceLock";

export function SourceLockBar() {
  const { t } = useTranslation();
  const { lock } = useSourceScope();
  const clear = useSourceLock((s) => s.clear);
  const language = useSettings((s) => s.language);
  const count = useInstallableStats().bySource[lock ?? "winget"];
  if (!lock) return null;
  const meta = getSource(lock);

  return (
    <div role="status" className="flex items-center gap-3 border-b border-line bg-accent/8 px-6 py-2 text-sm lg:px-8 2xl:px-10">
      <span className={cn("size-2.5 shrink-0 rounded-full", meta.dot)} />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{t("sourceLock.title", { source: meta.label })}</span>
        <span className="text-muted">
          {" · "}
          {/* Správce pro vývojáře: v katalogu aplikací není, hledá se v jeho registru */}
          {isDevLock(lock)
            ? t("sourceLock.textDev", { source: meta.label })
            : count !== undefined
              ? t("sourceLock.text", { source: meta.label, count, formatted: formatAppCount(count, language) })
              : t("sourceLock.textNoCount", { source: meta.label })}
        </span>
      </p>
      <button
        type="button"
        onClick={clear}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-semibold transition-colors hover:border-accent/50 hover:text-accent"
      >
        <X className="size-3.5" />
        {t("sourceLock.showAll")}
      </button>
    </div>
  );
}
