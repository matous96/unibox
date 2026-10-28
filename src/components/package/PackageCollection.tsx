import { useVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState } from "react";
import { useScrollContainer } from "@/hooks/useScrollContainer";
import { useSettings } from "@/store/settings";
import type { CatalogEntry } from "@/types";
import { PackageCard } from "./PackageCard";
import { PackageRow } from "./PackageRow";

interface PackageCollectionProps {
  packages: CatalogEntry[];
  showUninstall?: boolean;
}

/** Mřížka: nejmenší šířka karty a mezera – sloupce přibývají se šířkou okna (jako auto-fill). */
const CARD_MIN = 240;
const CARD_GAP = 16;
/** Seznam: mezera mezi řádky. */
const ROW_GAP = 2;
/** Odhad výšky řádku do změření – skutečnou výšku měří virtualizér, odhad jen ladí posuvník. */
const ESTIMATE = { grid: 241, list: 65 };
/** Kolik řádků vykreslit navíc nad a pod viditelnou částí – při rychlém scrollu nebliká prázdno. */
const OVERSCAN = { grid: 3, list: 12 };

/**
 * Seznam balíčků v aktuálně zvoleném zobrazení (mřížka / seznam).
 *
 * Virtualizovaný: v DOM jsou jen řádky ve výhledu posuvné oblasti okna (a pár
 * navíc) – katalog má desítky tisíc aplikací a s plným DOM by scrollování
 * i filtrování zpomalovalo. Mřížka se dělí na řádky karet podle šířky; výšku
 * každého řádku virtualizér změří (karty s delším popisem jsou vyšší).
 * Seznam leží uvnitř stránky – obsah nad ním (záhlaví, filtry) je scrollMargin.
 */
export function PackageCollection({ packages, showUninstall }: PackageCollectionProps) {
  const mode = useSettings((s) => s.viewMode) === "list" ? "list" : "grid";
  const scroller = useScrollContainer();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  // Šířka seznamu (počet sloupců) a jeho vzdálenost od začátku posuvné oblasti
  useLayoutEffect(() => {
    const el = container.current;
    const scrollEl = scroller?.current;
    if (!el || !scrollEl) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setOffset(Math.round(el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Obsah nad seznamem (načtený banner, filtry, druhý seznam ve vyhledávání) ho posouvá – sleduje se celá stránka
    if (scrollEl.firstElementChild) observer.observe(scrollEl.firstElementChild);
    return () => observer.disconnect();
  }, [scroller]);

  const columns = mode === "list" ? 1 : Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN + CARD_GAP)));
  const virtualizer = useVirtualizer({
    // Do změření šířky nic – jinak by se na okamžik vykreslil jeden sloupec
    count: width ? Math.ceil(packages.length / columns) : 0,
    getScrollElement: () => scroller?.current ?? null,
    estimateSize: () => ESTIMATE[mode],
    gap: mode === "list" ? ROW_GAP : CARD_GAP,
    overscan: OVERSCAN[mode],
    scrollMargin: offset,
    // Změřená výška patří řádku s danými aplikacemi a počtem sloupců (jiný filtr či šířka = jiný řádek)
    getItemKey: (row) => `${mode}:${columns}:${packages[row * columns]?.id ?? row}`,
  });

  return (
    <div ref={container} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => {
        const first = row.index * columns;
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            // top místo transform – transform by z každého řádku udělal vrstvu a překryl by nabídky karet nad ním
            className={mode === "list" ? "absolute inset-x-0" : "absolute inset-x-0 grid gap-4"}
            style={{
              top: row.start - virtualizer.options.scrollMargin,
              gridTemplateColumns: mode === "grid" ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
            }}
          >
            {mode === "list" ? (
              <PackageRow entry={packages[first]} showUninstall={showUninstall} />
            ) : (
              // Karty bez vlastních animací – při přeskládání mřížky (filtr, šířka okna) nepřejíždějí do strany
              packages.slice(first, first + columns).map((p) => <PackageCard key={p.id} entry={p} showUninstall={showUninstall} />)
            )}
          </div>
        );
      })}
    </div>
  );
}
