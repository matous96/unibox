import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

interface ShelfProps {
  title: string;
  icon?: ReactNode;
  /** Větší nadpis (sekce v detailu balíčku). */
  large?: boolean;
  children: ReactNode;
}

/**
 * Horizontální „police“ karet s tlačítky pro posun.
 * Šipky se zneaktivní na začátku / konci police.
 */
export function Shelf({ title, icon, large, children }: ShelfProps) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const updateEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    updateEdges();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdges, children]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className={cn("flex items-center gap-2 font-display font-bold", large ? "text-2xl" : "text-xl")}>
          {icon}
          {title}
        </h2>
        <div className="flex gap-1">
          <IconButton aria-label={t("home.scrollLeft")} disabled={edges.start} onClick={() => scrollBy(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton aria-label={t("home.scrollRight")} disabled={edges.end} onClick={() => scrollBy(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
      </div>
      {/* Záporné okraje + padding: stíny karet se neořežou. */}
      <div
        ref={scroller}
        onScroll={updateEdges}
        className="no-scrollbar -mx-2 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-2 pt-1 pb-4"
      >
        {children}
      </div>
    </section>
  );
}

/** Obal jedné karty v polici (pevná šířka + přichycení při posunu). */
export function ShelfItem({ children }: { children: ReactNode }) {
  return <div className="w-64 shrink-0 snap-start">{children}</div>;
}
