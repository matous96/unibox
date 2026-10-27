import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { PackageCollection } from "@/components/package/PackageCollection";
import { Button } from "@/components/ui/Button";
import { CollectionToolbar } from "@/components/ui/CollectionToolbar";
import { CardSkeletons, EmptyState, ErrorState, PageHeader } from "@/components/ui/States";
import { useInstalledItems, useUpdates } from "@/hooks/useInstalledItems";
import { useSortedPackages } from "@/hooks/usePackages";
import { cn, normalize } from "@/lib/utils";
import { OriginFilter, type OriginFilterValue } from "@/components/package/SourceFilter";
import { useAutoUpdates } from "@/store/autoUpdates";
import { useSelection } from "@/store/selection";
import type { InstallOrigin } from "@/types";

type Filter = "all" | "updates";

/** Nainstalované balíčky s filtrem aktualizací a hromadnou aktualizací. */
export function InstalledPage() {
  const { t } = useTranslation();
  const { data: installed, items, isLoading, isError, refetch, isFetching } = useInstalledItems();
  const { updatable, pending: pendingUpdates, updateAll } = useUpdates();
  // Filtr je v URL (?filter=updates), aby na něj mohl odkazovat postranní panel.
  const [params, setParams] = useSearchParams();
  const filter: Filter = params.get("filter") === "updates" ? "updates" : "all";
  const setFilter = (next: Filter) => setParams(next === "updates" ? { filter: "updates" } : {}, { replace: true });
  const [text, setText] = useState("");
  const [originFilter, setOriginFilter] = useState<OriginFilterValue>("all");

  // Nastavení → Aktualizace balíčků: při otevření seznamu aktualizací je předem zaškrtnout
  const preselect = useAutoUpdates((s) => s.preselectUpdates);
  const selectMany = useSelection((s) => s.selectMany);
  const preselected = useRef(false);
  useEffect(() => {
    if (filter !== "updates") {
      preselected.current = false;
      return;
    }
    if (!preselect || preselected.current || !updatable.length) return;
    preselected.current = true;
    selectMany(updatable.map((i) => i.entry));
  }, [filter, preselect, updatable, selectMany]);

  // Počty podle původu instalace (pro filtr) v rámci zvolené záložky
  const originCounts = useMemo(() => {
    const counts: Partial<Record<InstallOrigin, number>> = {};
    for (const i of filter === "updates" ? updatable : items) counts[i.pkg.origin] = (counts[i.pkg.origin] ?? 0) + 1;
    return counts;
  }, [items, updatable, filter]);

  const entries = useMemo(() => {
    const q = normalize(text.trim());
    return (filter === "updates" ? updatable : items)
      .filter((i) => originFilter === "all" || i.pkg.origin === originFilter)
      .map((i) => i.entry)
      .filter((e) => !q || normalize(e.name).includes(q) || normalize(e.id).includes(q));
  }, [items, updatable, filter, originFilter, text]);
  const sorted = useSortedPackages(entries);

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: t("installed.all"), count: installed?.length ?? 0 },
    { id: "updates", label: t("installed.updates"), count: updatable.length },
  ];

  return (
    <>
      <PageHeader
        title={t("installed.title")}
        subtitle={t("installed.subtitle")}
        actions={
          <>
            <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              {t("installed.refresh")}
            </Button>
            <Button onClick={updateAll} disabled={pendingUpdates === 0}>
              {t("installed.updateAll")}
              {pendingUpdates > 0 && (
                <span className="rounded-full bg-white/25 px-1.5 text-[11px] leading-5">{pendingUpdates}</span>
              )}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Filtr: Vše / Dostupné aktualizace */}
        <div className="flex rounded-full border border-line bg-surface-2 p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                filter === tab.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] leading-5 font-semibold",
                  tab.id === "updates" && tab.count > 0 ? "bg-accent text-accent-fg" : "bg-surface-3 text-muted",
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("installed.filterPlaceholder")}
            className="h-9 w-52 rounded-full border border-line bg-surface pr-3 pl-8 text-sm outline-none placeholder:text-muted focus:border-accent/50"
          />
        </div>

        <div className="ml-auto">
          <CollectionToolbar />
        </div>
      </div>

      {/* Filtr podle původu instalace (WinGet: winget / msstore, Steam, Chocolatey, Scoop, Lokální) */}
      <div className="mb-5">
        <OriginFilter value={originFilter} onChange={setOriginFilter} counts={originCounts} />
      </div>

      {isLoading ? (
        <CardSkeletons count={6} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState message={filter === "updates" && !text ? t("installed.noUpdates") : t("installed.empty")} />
      ) : (
        <PackageCollection packages={sorted} showUninstall />
      )}
    </>
  );
}
