import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useJobs } from "@/store/jobs";
import type { Job } from "@/types";

interface JobProgressProps {
  job: Job;
  className?: string;
}

/**
 * Živý průběh operace: popisek fáze, procenta, pruh a tlačítko Zrušit.
 * Neurčitý průběh (percent = null) se zobrazí jako běžící animace.
 */
export function JobProgress({ job, className }: JobProgressProps) {
  const { t } = useTranslation();
  const cancel = useJobs((s) => s.cancel);
  const { phase, percent } = job.progress;
  const waiting = phase === "queued" || phase === "elevating" || phase === "interactive";
  // Fáze, kdy se čeká na uživatele (UAC, průvodce instalací) – zvýraznit
  const needsUser = phase === "elevating" || phase === "interactive";

  return (
    <div className={cn("flex w-full min-w-0 items-center gap-2", className)}>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className={cn("truncate font-medium", needsUser ? "text-amber-500" : "text-fg")}>
            {t(`phase.${phase}`)}
          </span>
          {percent !== null && <span className="tabular-nums text-muted">{percent} %</span>}
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3">
          {percent !== null ? (
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
              style={{ width: `${percent}%` }}
            />
          ) : (
            <div
              className={cn(
                "animate-indeterminate absolute inset-y-0 w-2/5 rounded-full",
                waiting ? "bg-muted/50" : "bg-accent",
              )}
            />
          )}
        </div>
      </div>
      <IconButton
        aria-label={t("package.cancel")}
        title={t("package.cancel")}
        className="relative z-10 size-7"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          cancel(job.appId);
        }}
      >
        <X className="size-4" />
      </IconButton>
    </div>
  );
}
