import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/ui/States";
import { CATEGORIES } from "@/data/categories";
import { useCatalog } from "@/hooks/usePackages";
import { cn } from "@/lib/utils";
import { inLockedSource, useSourceScope } from "@/store/sourceLock";

/** Mřížka kategorií s počtem aplikací. */
export function CategoriesPage() {
  const { t } = useTranslation();
  const { data } = useCatalog();
  const { lock } = useSourceScope();

  // Počet balíčků v každé kategorii (při zamčeném zdroji jen z něj)
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of data?.catalog.packages ?? []) {
      if (!inLockedSource(p, lock)) continue;
      for (const c of p.categories) map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
  }, [data, lock]);

  return (
    <>
      <PageHeader title={t("categories.title")} subtitle={t("categories.subtitle")} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {CATEGORIES.map(({ id, icon: Icon }) => (
          // Neutrální dlaždice: ikona v rámečku, název, počet a velká obrysová ikona v rohu
          <Link
            key={id}
            to={`/categories/${id}`}
            className={cn(
              "group relative flex h-36 flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card",
              "transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover",
            )}
          >
            {/* Velká ikona v pozadí */}
            <Icon
              aria-hidden
              className="absolute -right-4 -bottom-4 size-28 text-fg opacity-[0.06] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
              strokeWidth={1.5}
            />
            <span className="flex size-11 items-center justify-center rounded-xl bg-surface-2 ring-1 ring-line">
              <Icon className="size-6 text-accent" />
            </span>
            <div>
              <p className="font-display text-lg font-bold">{t(`categories.${id}`)}</p>
              <p className="text-xs text-muted">{t("categories.appsCount", { count: counts.get(id) ?? 0 })}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
