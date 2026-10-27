import { startTransition, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/store/settings";
import type { CatalogEntry } from "@/types";
import { PackageCard } from "./PackageCard";
import { PackageRow } from "./PackageRow";

interface PackageCollectionProps {
  packages: CatalogEntry[];
  showUninstall?: boolean;
}

/** Kolik položek vykreslit najednou (katalog má desítky tisíc aplikací). */
const PAGE = 60;

/**
 * Seznam balíčků v aktuálně zvoleném zobrazení (mřížka / seznam).
 * Vykresluje se postupně: prvních 60 položek, další se dočtou, když se
 * uživatel přiblíží ke konci (případně tlačítkem „Zobrazit další“). Dočtení
 * běží jako přechod Reactu (startTransition) – vykreslování se rozdělí mezi
 * snímky a scrollování se při něm nezasekne.
 */
export function PackageCollection({ packages, showUninstall }: PackageCollectionProps) {
  const { t } = useTranslation();
  const viewMode = useSettings((s) => s.viewMode);
  const [visible, setVisible] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  // Jiný seznam (filtr, řazení) → znovu od začátku
  useEffect(() => setVisible(PAGE), [packages]);

  const showMore = () => startTransition(() => setVisible((v) => Math.min(v + PAGE, packages.length)));

  // Dočítání při přiblížení ke konci seznamu – s předstihem, ať je další dávka hotová dřív, než k ní scroll dojede
  useEffect(() => {
    const el = sentinel.current;
    if (!el || visible >= packages.length) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && showMore(), { rootMargin: "1200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, packages.length]);

  const shown = packages.slice(0, visible);
  const rest = packages.length - shown.length;

  const more =
    rest > 0 ? (
      <div ref={sentinel} className="flex justify-center pt-6">
        <button
          type="button"
          onClick={showMore}
          className="h-10 cursor-pointer rounded-full border border-line bg-surface px-5 text-sm font-semibold transition-colors hover:bg-surface-2"
        >
          {t("view.showMore", { count: rest })}
        </button>
      </div>
    ) : null;

  if (viewMode === "list") {
    return (
      <>
        <div className="flex flex-col gap-0.5">
          {shown.map((p) => (
            <PackageRow key={p.id} entry={p} showUninstall={showUninstall} />
          ))}
        </div>
        {more}
      </>
    );
  }

  return (
    <>
      {/* Karty bez vlastních animací – při přeskládání mřížky (filtr, šířka okna) nepřejíždějí do strany */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {shown.map((p) => (
          <PackageCard key={p.id} entry={p} showUninstall={showUninstall} />
        ))}
      </div>
      {more}
    </>
  );
}
