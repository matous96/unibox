import type { MouseEvent } from "react";
import { Check, Download, Play, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { useInstallActions } from "@/hooks/useInstallActions";
import { launchApp, useLaunchTarget } from "@/lib/launch";
import { useToasts } from "@/store/toasts";
import type { CatalogEntry, InstalledPackage, SourceId } from "@/types";
import { JobProgress } from "./JobProgress";

interface PackageActionProps {
  entry: CatalogEntry;
  /** Výslovně zvolený zdroj (detail aplikace); jinak podle priority v nastavení. */
  source?: SourceId;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Hlavní akce aplikace jedním kliknutím:
 *  - běží úloha → živý průběh se zrušením,
 *  - nenainstalováno → Instalovat (ze zvoleného / preferovaného zdroje),
 *  - existuje novější verze → Aktualizovat (přes zdroj, ze kterého je nainstalovaná),
 *  - nainstalováno a v nabídce Start → Otevřít (spustí aplikaci),
 *  - jinak → informace „Nainstalováno“.
 */
export function PackageAction({ entry, source, size = "sm", className }: PackageActionProps) {
  const { t } = useTranslation();
  // Instalace použije uložené možnosti instalace (zdroj, verze, jako správce…)
  const actions = useInstallActions(entry, source);
  const { status, job } = actions;
  const effective = actions.source;
  const canLaunch = !!useLaunchTarget(entry, actions.installed);

  if (job) return <JobProgress job={job} className={className} />;

  // Klik uvnitř karty nesmí zároveň otevřít detail.
  const run = (kind: "install" | "update") => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (kind === "install") actions.install();
    else actions.update();
  };

  const iconSize = size === "sm" ? "size-3.5" : "size-4";

  if (status === "available") {
    return (
      <Button size={size} onClick={run("install")} disabled={!effective} className={className}>
        <Download className={iconSize} />
        {t("package.install")}
      </Button>
    );
  }

  if (status === "updatable") {
    return (
      <Button size={size} onClick={run("update")} className={className}>
        <RefreshCw className={iconSize} />
        {t("package.update")}
      </Button>
    );
  }

  if (canLaunch) {
    // V detailu hlavní akce, na kartě decentně (Instalovat / Aktualizovat mají vyniknout)
    const variant = size === "lg" ? "primary" : "secondary";
    return <LaunchButton entry={entry} installed={actions.installed} size={size} variant={variant} className={className} />;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold text-success ${size === "sm" ? "text-xs" : "text-sm"} ${className ?? ""}`}
    >
      <Check className={iconSize} />
      {t("package.installed")}
    </span>
  );
}

/**
 * Otevřít – spustí nainstalovanou aplikaci přes její položku v nabídce Start.
 * Nic nevykreslí, pokud aplikaci spustit nejde (není v nabídce Start, webová verze).
 */
export function LaunchButton({
  entry,
  installed,
  size = "sm",
  variant = "secondary",
  className,
}: {
  entry: CatalogEntry;
  installed: InstalledPackage | undefined;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const target = useLaunchTarget(entry, installed);
  if (!target) return null;

  const open = (e: MouseEvent) => {
    // Klik uvnitř karty nesmí zároveň otevřít detail
    e.preventDefault();
    e.stopPropagation();
    launchApp(target).then(
      () => toast("info", t("launch.starting", { name: entry.name })),
      (error: unknown) => toast("error", t("launch.failed", { name: entry.name, error: String(error) })),
    );
  };

  return (
    <Button size={size} variant={variant} onClick={open} title={target.name} className={className}>
      <Play className={size === "sm" ? "size-3.5" : "size-4"} />
      {t("package.open")}
    </Button>
  );
}
