import { Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PackageCollection } from "@/components/package/PackageCollection";
import { Button } from "@/components/ui/Button";
import { CollectionToolbar } from "@/components/ui/CollectionToolbar";
import { EmptyState, PageHeader } from "@/components/ui/States";
import { fallbackEntry, parseSourceKey, useCatalogIndex } from "@/hooks/usePackages";
import { useRecent } from "@/store/recent";
import { inLockedSource, useSourceScope } from "@/store/sourceLock";
import type { CatalogEntry } from "@/types";

/** Naposledy zobrazené aplikace (od nejnovější). */
export function RecentPage() {
  const { t } = useTranslation();
  const { items, clear } = useRecent();
  const catalogIndex = useCatalogIndex();
  const { lock } = useSourceScope();

  // Pořadí podle času zobrazení – záměrně bez přeřazování podle nastavení.
  // Balíčky mimo katalog se obnoví z id "zdroj:balíček"; neznámá id se vynechají.
  // Při zamčeném zdroji (levý panel) jen aplikace z něj.
  const entries = useMemo(
    () =>
      items
        .map((i) => {
          const fromCatalog = catalogIndex.get(i.id);
          if (fromCatalog) return fromCatalog;
          const parsed = parseSourceKey(i.id);
          return parsed ? fallbackEntry(parsed.source, parsed.packageId, i.name, i.version) : null;
        })
        .filter((e): e is CatalogEntry => e !== null && inLockedSource(e, lock)),
    [items, catalogIndex, lock],
  );

  return (
    <>
      <PageHeader
        title={t("recent.title")}
        subtitle={t("recent.subtitle")}
        actions={
          entries.length > 0 && (
            <Button variant="secondary" onClick={clear}>
              <Trash2 className="size-4" />
              {t("recent.clear")}
            </Button>
          )
        }
      />
      {entries.length === 0 ? (
        <EmptyState message={t("recent.empty")} />
      ) : (
        <>
          <div className="mb-5 flex justify-end">
            <CollectionToolbar hideSort />
          </div>
          <PackageCollection packages={entries} />
        </>
      )}
    </>
  );
}
