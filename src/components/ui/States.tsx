import { Loader2, PackageOpen, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Točící se indikátor načítání. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted", className)} />;
}

/** Zástupný obsah během načítání – „kostry“ karet. */
export function CardSkeletons({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[210px] animate-pulse rounded-2xl border border-line bg-surface p-4">
          <div className="size-14 rounded-xl bg-surface-3" />
          <div className="mt-4 h-4 w-2/3 rounded bg-surface-3" />
          <div className="mt-2 h-3 w-1/3 rounded bg-surface-2" />
          <div className="mt-4 h-3 w-full rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

/** Prázdný stav s ikonou a textem. */
export function EmptyState({ message, action, icon: Icon = PackageOpen }: { message: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted">
      <Icon className="size-12 opacity-40" strokeWidth={1.5} />
      <p className="text-sm">{message}</p>
      {action}
    </div>
  );
}

/** Chybový stav s možností opakovat. */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      message={t("common.error")}
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className="cursor-pointer text-sm font-semibold text-accent">
            {t("common.retry")}
          </button>
        )
      }
    />
  );
}

/** Nadpis stránky s volitelným podtitulem a akcemi vpravo. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
