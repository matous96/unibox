import { ArrowRight, Check, Download, Loader2, RefreshCw, ShieldCheck, Sparkles, Upload, type LucideIcon } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PackageIcon } from "@/components/package/PackageIcon";
import { isUnmanagedOrigin, useInstalledItems, useUpdates } from "@/hooks/useInstalledItems";
import { PROFILE_ACCEPT, useProfileTransfer } from "@/hooks/useProfileTransfer";
import { cn } from "@/lib/utils";
import { ORIGINS } from "@/services/managers";
import { useOriginLabel } from "@/components/package/SourceBadge";
import { CleanupDialog } from "./CleanupDialog";

/**
 * Rychlý přehled stavu počítače nahoře na domovské stránce: dostupné
 * aktualizace s „Aktualizovat vše“, kolik aplikací Unibox spravuje (podle
 * původu instalace) a rychlé akce – export / import profilu a vyčištění systému.
 */
export function SystemStatus() {
  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-[1.25fr_1.25fr_1fr]">
      <UpdatesCard />
      <ManagementCard />
      <QuickActionsCard />
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-card", className)}>{children}</section>;
}

/** Dostupné aktualizace a hromadná aktualizace jedním kliknutím. */
function UpdatesCard() {
  const { t } = useTranslation();
  const { updatable, pending, running, updateAll, isLoading } = useUpdates();
  const count = updatable.length;

  return (
    <Card className={cn(count > 0 && "border-accent/30 bg-gradient-to-br from-accent/12 to-surface")}>
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
        <RefreshCw className="size-3.5" />
        {t("status.updates")}
      </p>
      {isLoading ? (
        <div className="mt-3 h-14 animate-pulse rounded-xl bg-surface-2" />
      ) : count === 0 ? (
        <div className="mt-3 flex flex-1 items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-success/15 text-success">
            <Check className="size-6" />
          </span>
          <div>
            <p className="text-lg font-semibold">{t("status.upToDate")}</p>
            <p className="text-sm text-muted">{t("status.upToDateText")}</p>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-lg leading-snug font-semibold">{t("status.updatesReady", { count })}</p>
          <div className="mt-3 flex items-center -space-x-2">
            {updatable.slice(0, 6).map(({ entry }) => (
              <Link key={entry.id} to={`/package/${encodeURIComponent(entry.id)}`} title={entry.name} className="rounded-[10px] ring-2 ring-surface hover:z-10">
                <PackageIcon id={entry.id} name={entry.name} iconUrl={entry.iconUrl} size={32} />
              </Link>
            ))}
            {count > 6 && (
              <span className="flex size-8 items-center justify-center rounded-[10px] bg-surface-3 text-[11px] font-bold ring-2 ring-surface">
                +{count - 6}
              </span>
            )}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
            {pending > 0 ? (
              <button
                type="button"
                onClick={updateAll}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg shadow-lg shadow-accent/25 transition hover:brightness-110"
              >
                <RefreshCw className="size-4" />
                {t("status.updateAll")}
              </button>
            ) : (
              <span className="inline-flex h-10 items-center gap-2 text-sm font-semibold text-accent">
                <Loader2 className="size-4 animate-spin" />
                {t("status.updating", { count: running })}
              </span>
            )}
            <Link to="/installed?filter=updates" className="text-sm font-medium text-muted hover:text-fg">
              {t("status.showUpdates")}
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

/** Kolik aplikací na PC spravuje Unibox – rozpis podle původu instalace. */
function ManagementCard() {
  const { t } = useTranslation();
  const originLabel = useOriginLabel();
  const { items, isLoading } = useInstalledItems();

  const { total, managed, byOrigin } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.pkg.origin, (counts.get(i.pkg.origin) ?? 0) + 1);
    return {
      total: items.length,
      managed: items.filter((i) => !isUnmanagedOrigin(i.pkg.origin)).length,
      // V pořadí ORIGINS (WinGet, msstore, Chocolatey, Scoop, …, Steam, mimo správce)
      byOrigin: ORIGINS.filter((o) => counts.has(o.id)).map((o) => ({ ...o, count: counts.get(o.id)! })),
    };
  }, [items]);

  return (
    <Card>
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
        <ShieldCheck className="size-3.5" />
        {t("status.management")}
      </p>
      {isLoading ? (
        <div className="mt-3 h-14 animate-pulse rounded-xl bg-surface-2" />
      ) : (
        <>
          <p className="mt-2 text-lg leading-snug font-semibold">
            {t("status.managed", { managed, total })}
          </p>
          {/* Poměrný pruh podle původu instalace */}
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-3">
            {byOrigin.map((o) => (
              <div
                key={o.id}
                title={`${originLabel(o.id)}: ${o.count}`}
                className={cn("h-full border-r border-surface last:border-r-0", o.dot)}
                style={{ width: `${(o.count / Math.max(total, 1)) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted">
            {byOrigin.map((o) => (
              <li key={o.id} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", o.dot)} />
                {originLabel(o.id)}
                <span className="font-semibold text-fg tabular-nums">{o.count}</span>
              </li>
            ))}
          </ul>
          <Link to="/installed" className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-muted hover:text-fg">
            {t("status.showInstalled")}
            <ArrowRight className="size-3.5" />
          </Link>
        </>
      )}
    </Card>
  );
}

/** Rychlé akce: export / import profilu (přenos na nový počítač) a vyčištění mezipamětí. */
function QuickActionsCard() {
  const { t } = useTranslation();
  const { portableCount, exportProfile, exportWinget, importFile } = useProfileTransfer();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  return (
    <Card>
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
        <Sparkles className="size-3.5" />
        {t("status.quickActions")}
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        <Action icon={Download} title={t("profile.export")} hint={t("profile.exportHint", { count: portableCount })} onClick={() => void exportProfile()} />
        <Action icon={Upload} title={t("profile.import")} hint={t("profile.importHint")} onClick={() => fileInput.current?.click()} />
        <Action icon={Sparkles} title={t("cleanup.title")} hint={t("cleanup.hint")} onClick={() => setCleanupOpen(true)} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <button type="button" onClick={() => void exportProfile("html")} className="cursor-pointer underline-offset-2 hover:text-fg hover:underline">
          {t("profile.exportHtml")}
        </button>
        <button type="button" onClick={() => void exportWinget()} className="cursor-pointer underline-offset-2 hover:text-fg hover:underline">
          {t("profile.exportWinget")}
        </button>
      </p>
      <input
        ref={fileInput}
        type="file"
        accept={PROFILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
      <CleanupDialog open={cleanupOpen} onClose={() => setCleanupOpen(false)} />
    </Card>
  );
}

function Action({ icon: Icon, title, hint, onClick }: { icon: LucideIcon; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}
