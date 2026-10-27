import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { PackageCollection } from "@/components/package/PackageCollection";
import { matchesSource, SourceFilter, type SourceFilterValue } from "@/components/package/SourceFilter";
import { CollectionToolbar } from "@/components/ui/CollectionToolbar";
import { CardSkeletons, EmptyState, PageHeader } from "@/components/ui/States";
import { getCategory } from "@/data/categories";
import { useCatalog, useModeFilter, useSortedPackages } from "@/hooks/usePackages";
import { getSource } from "@/services/managers";
import { useSourceScope } from "@/store/sourceLock";

/** Seznam aplikací v jedné kategorii s filtrem podle správce balíčků. */
export function CategoryPage() {
  const { t } = useTranslation();
  const { categoryId = "" } = useParams();
  const category = getCategory(categoryId);
  const { data, isLoading } = useCatalog();
  // Filtr se záměrně zachovává při přechodu mezi kategoriemi.
  const [pickedFilter, setSourceFilter] = useState<SourceFilterValue>("all");
  // Zamčený zdroj (levý panel) má přednost – filtr stránky se pak neukazuje
  const { lock } = useSourceScope();
  const sourceFilter = lock ? "all" : pickedFilter;

  const modeFilter = useModeFilter();
  const packages = useMemo(() => {
    if (!category) return [];
    const list = (data?.catalog.packages ?? []).filter(
      (p) => p.categories.includes(category.id) && matchesSource(p.sources, sourceFilter),
    );
    // Běžný uživatel nevidí balíčky jen pro vývojáře – ledaže si vývojářského správce vybral ve filtru
    return sourceFilter !== "all" && getSource(sourceFilter).group === "dev" ? list : modeFilter(list);
  }, [data, category, sourceFilter, modeFilter]);
  const sorted = useSortedPackages(packages);

  if (!category) return <EmptyState message={t("categories.notFound")} />;
  const Icon = category.icon;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Icon className="size-8 text-accent" strokeWidth={2.25} />
            {t(`categories.${category.id}`)}
          </span>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {!lock && <SourceFilter value={sourceFilter} onChange={setSourceFilter} />}
        <div className="min-w-0 flex-1">
          <CollectionToolbar count={sorted.length} />
        </div>
      </div>
      {isLoading ? (
        <CardSkeletons />
      ) : sorted.length === 0 ? (
        <EmptyState
          message={
            sourceFilter === "all"
              ? t("categories.empty")
              : t("filters.emptyForSource", { source: getSource(sourceFilter).label })
          }
        />
      ) : (
        <PackageCollection packages={sorted} />
      )}
    </>
  );
}
