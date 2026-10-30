import { Fingerprint, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { getSource } from "@/services/managers";
import { useToasts } from "@/store/toasts";
import type { PackageSource } from "@/types";

/**
 * Krátké ujištění u tlačítka Instalovat: odkud se aplikace stáhne a proč je
 * instalace bezpečná. U správců aplikací (winget, Chocolatey, Scoop) se
 * instalátory ověřují kontrolním součtem a v repozitářích procházejí
 * antivirovou kontrolou; u registrů pro vývojáře jen uvádíme oficiální zdroj.
 * Vedle je indikátor ověření SHA-256 (HashBadge).
 */
export function SafeInstallNote({ pkg, skipHash }: { pkg: PackageSource; skipHash?: boolean }) {
  const { t } = useTranslation();
  const meta = getSource(pkg.source);
  const apps = meta.group === "apps";

  return (
    // Štít zůstává vlevo a text se zalamuje vedle něj (i v úzkém panelu detailu)
    <div className="flex min-w-0 items-start gap-1.5 text-xs">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1.5">
        <span className="font-medium text-emerald-600 dark:text-emerald-400">
          {t(apps ? "safe.apps" : "safe.dev", { source: meta.label })}
        </span>
        {apps && <HashBadge pkg={pkg} skipHash={skipHash} />}
        <Link to="/help?faq=safe" className="text-muted underline-offset-2 hover:text-fg hover:underline">
          {t("safe.how")}
        </Link>
      </p>
    </div>
  );
}

/**
 * Indikátor ověření kontrolního součtu instalátoru:
 *  - známý SHA-256 z manifestu → „SHA-256 ověřen · 3f2a…9c1d“ (kliknutím se
 *    zkopíruje celý součet). HubGet stažený instalátor před spuštěním porovná
 *    se součtem z manifestu (src-tauri/src/operations.rs), winget ještě jednou,
 *  - součet v katalogu není (méně známé aplikace) → ověří ho správce sám,
 *  - kontrola vypnutá v Možnostech instalace → varování.
 */
function HashBadge({ pkg, skipHash }: { pkg: PackageSource; skipHash?: boolean }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const source = getSource(pkg.source).label;
  const hash = pkg.sha256?.toLowerCase() ?? null;
  const chip = "inline-flex h-6 items-center gap-1 rounded-full px-2 font-medium tabular-nums";

  if (skipHash) {
    return (
      <span title={t("safe.hashOffHint")} className={cn(chip, "bg-amber-500/12 text-amber-700 dark:text-amber-300")}>
        <ShieldAlert className="size-3.5" />
        {t("safe.hashOff")}
      </span>
    );
  }

  if (!hash) {
    return (
      <span title={t("safe.hashByManagerHint", { source })} className={cn(chip, "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
        <Fingerprint className="size-3.5" />
        {t("safe.hashByManager", { source })}
      </span>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      toast("success", t("safe.hashCopied"));
    } catch {
      toast("error", t("common.error"));
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={t("safe.hashHint", { source, hash, version: pkg.version })}
      aria-label={t("safe.hashVerified")}
      className={cn(chip, "cursor-pointer bg-emerald-500/10 text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300")}
    >
      <Fingerprint className="size-3.5" />
      {t("safe.hashVerified")}
      <span className="font-mono text-[11px] opacity-75">
        {hash.slice(0, 4)}…{hash.slice(-4)}
      </span>
    </button>
  );
}
