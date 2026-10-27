import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageRow } from "@/components/package/PackageRow";
import { matchesSource, SourceFilter, type SourceFilterValue } from "@/components/package/SourceFilter";
import { CardSkeletons, EmptyState, PageHeader } from "@/components/ui/States";
import { getSource } from "@/services/managers";
import { CATEGORIES } from "@/data/categories";
import { useCatalog, useModeFilter } from "@/hooks/usePackages";
import { cn } from "@/lib/utils";
import { useSourceScope } from "@/store/sourceLock";
import type { CategoryId } from "@/types";

const LIMIT = 50;

/**
 * Žebříček nejstahovanějších aplikací. Winget počty stažení nezveřejňuje,
 * pořadí proto vychází ze skóre popularity, které počítá data pipeline.
 */
export function TopChartsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useCatalog();
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [pickedFilter, setSourceFilter] = useState<SourceFilterValue>("all");
  // Zamčený zdroj (levý panel) má přednost – filtr stránky se pak neukazuje
  const { lock } = useSourceScope();
  const sourceFilter = lock ? "all" : pickedFilter;

  const modeFilter = useModeFilter();
  // Pořadí se počítá až po filtrech – „č. 1 ve Scoopu“ je nejpopulárnější aplikace dostupná ve Scoopu.
  const ranked = useMemo(() => {
    const list = (data?.catalog.packages ?? []).filter(
      (p) => (category === "all" || p.categories.includes(category)) && matchesSource(p.sources, sourceFilter),
    );
    // Běžný uživatel nevidí balíčky jen pro vývojáře – ledaže si vývojářského správce vybral ve filtru
    const visible = sourceFilter !== "all" && getSource(sourceFilter).group === "dev" ? list : modeFilter(list);
    return visible.sort((a, b) => b.popularity - a.popularity).slice(0, LIMIT);
  }, [data, category, sourceFilter, modeFilter]);

  return (
    <>
      <PageHeader
        title={t("top.title")}
        subtitle={t("top.subtitle")}
        actions={lock ? undefined : <SourceFilter value={sourceFilter} onChange={setSourceFilter} />}
      />

      {/* Filtr kategorií */}
      <div className="no-scrollbar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
        {(["all", ...CATEGORIES.map((c) => c.id)] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
            className={cn(
              "h-8 shrink-0 cursor-pointer rounded-full border px-3.5 text-sm font-medium transition-colors",
              category === id
                ? "border-accent/30 bg-accent/12 text-accent"
                : "border-line bg-surface text-muted hover:text-fg",
            )}
          >
            {id === "all" ? t("top.all") : t(`categories.${id}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <CardSkeletons count={6} />
      ) : ranked.length === 0 ? (
        <EmptyState
          message={
            sourceFilter === "all"
              ? t("categories.empty")
              : t("filters.emptyForSource", { source: getSource(sourceFilter).label })
          }
        />
      ) : (
        // Sloupce jako žebříčky v App Store (pořadí čte shora dolů); jejich počet
        // podle šířky okna – sloupec má nejméně 28rem, na velkém monitoru jich je víc.
        <ol className="columns-[28rem] gap-x-8">
          {ranked.map((p, i) => (
            <li key={p.id} className="flex break-inside-avoid items-center gap-1 border-b border-line">
              <span className="w-9 shrink-0 text-center font-display text-lg font-bold text-muted tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <PackageRow entry={p} compact />
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
