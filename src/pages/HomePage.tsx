import { Code } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CollectionModal } from "@/components/home/CollectionModal";
import { AppOfTheDayCard, AppStoryCard, CollectionCard } from "@/components/home/TodayCards";
import { ProfileCollections } from "@/components/home/ProfileCollections";
import { SystemStatus } from "@/components/home/SystemStatus";
import { UserModeToggle } from "@/components/home/UserModeToggle";
import { ValuePillars } from "@/components/home/ValuePillars";
import { PackageCard } from "@/components/package/PackageCard";
import { Shelf, ShelfItem } from "@/components/ui/Shelf";
import { PackageCollection } from "@/components/package/PackageCollection";
import { CollectionToolbar } from "@/components/ui/CollectionToolbar";
import { CardSkeletons, ErrorState } from "@/components/ui/States";
import { isDevOnly, useCatalog, useCatalogIndex, useModeFilter } from "@/hooks/usePackages";
import { todayPicks, type TodayShift } from "@/lib/today";
import { trendingScore } from "@/lib/trending";
import { cn, topN } from "@/lib/utils";
import { measureIcon, useIconQuality } from "@/store/iconQuality";
import { useSettings } from "@/store/settings";
import { useTodayPager, useTodayShift, type TodaySlot } from "@/store/todayPager";
import type { CatalogEntry } from "@/types";

type Tab = "trending" | "popular" | "new" | "updated";
const TABS: Tab[] = ["trending", "popular", "new", "updated"];
const TAB_SIZE = 12;

/**
 * Domovská obrazovka: pruh se třemi sliby (bezpečné, jednoduché, vše pod
 * kontrolou) → sekce „Dnes“ ve stylu App Store (příběh, kolekce, Aplikace dne)
 * → stav počítače → kolekce podle zaměření → Trendy / Populární / Nové / Aktualizované.
 */
export function HomePage() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const { data, isLoading, isError, refetch } = useCatalog();
  const catalogIndex = useCatalogIndex();
  const [tab, setTab] = useState<Tab>("trending");
  const developer = useSettings((s) => s.userMode === "developer");
  const modeFilter = useModeFilter();

  const all = useMemo(() => data?.catalog.packages ?? [], [data]);

  // Dnešní výběr: ručně psané příběhy a kolekce i známé aplikace z celého katalogu (lib/today.ts),
  // automaticky vybrané jen s ikonou ve vysokém rozlišení (store/iconQuality.ts)
  const iconSizes = useIconQuality((s) => s.sizes);
  // Listování šipkami na kartách (store/todayPager.ts)
  const shift = useTodayShift();
  const move = useTodayPager((s) => s.move);
  const { today, neighbours } = useMemo(() => {
    const size = (e: CatalogEntry) => (e.iconUrl ? iconSizes[e.iconUrl] : 0);
    const at = (by: number): TodayShift => ({
      story: shift.story + by,
      collections: [shift.collections[0] + by, shift.collections[1] + by],
    });
    return {
      today: todayPicks(all, catalogIndex, developer, size, undefined, shift),
      // Sousední výběry (šipka vpřed / vzad) – jejich ikony se změří předem
      neighbours: [todayPicks(all, catalogIndex, developer, size, undefined, at(1)), todayPicks(all, catalogIndex, developer, size, undefined, at(-1))],
    };
  }, [all, catalogIndex, developer, language, iconSizes, shift]);
  const paging = (slot: TodaySlot) => ({ onPrev: () => move(slot, -1), onNext: () => move(slot, 1) });

  // Ikony dnes vybraných aplikací změřit; do té doby (nejvýš 2 s) místo karet kostry,
  // ať se neukáže aplikace s rozmazanou ikonou, kterou výběr vzápětí vymění
  const unmeasured = today.unmeasured.map((e) => e.iconUrl ?? "").join("\n");
  const upcoming = neighbours.flatMap((n) => n.unmeasured.map((e) => e.iconUrl ?? "")).join("\n");
  useEffect(() => {
    for (const url of upcoming.split("\n").filter(Boolean)) void measureIcon(url);
  }, [upcoming]);
  useEffect(() => {
    for (const url of unmeasured.split("\n").filter(Boolean)) void measureIcon(url);
  }, [unmeasured]);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  const holdToday = !!unmeasured && !waited;

  // Obsah záložek (běžný uživatel bez balíčků jen pro vývojáře)
  // Jen prvních 12 v jednom průchodu – řazení celého katalogu by u Trendů trvalo desítky ms
  const tabItems = useMemo(() => {
    const now = Date.now();
    const visible = modeFilter(all);
    const time = (date: string | null | undefined) => (date ? Date.parse(date) || 0 : 0);
    const score: Record<Tab, (p: CatalogEntry) => number> = {
      trending: (p) => trendingScore(p, now),
      popular: (p) => p.popularity,
      new: (p) => time(p.addedAt),
      updated: (p) => time(p.releaseDate),
    };
    return topN(visible, TAB_SIZE, score[tab]);
  }, [all, tab, modeFilter]);

  // Režim Vývojář: nástroje pro vývojáře hned v prvním řádku
  const devTools = useMemo(
    () => (developer ? topN(all.filter((p) => isDevOnly(p) || p.categories.includes("development")), 14, (p) => p.popularity) : []),
    [all, developer],
  );

  if (isLoading) return <CardSkeletons />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const dateLabel = new Date().toLocaleDateString(language, { weekday: "long", day: "numeric", month: "long" });
  const [firstCollection, secondCollection] = today.collections;

  return (
    <>
      {/* ── Dnes: vlevo datum a nadpis, uprostřed tři sliby Uniboxu, vpravo přepínač režimu ── */}
      {/* Sliby na střed volného místa mezi nadpisem a přepínačem (přepínač je mnohem širší než
          „Dnes“ – na středu celého řádku by vypadaly posunuté doprava). Na užších obrazovkách
          se přesunou na vlastní řádek pod nadpis. */}
      <div className="mb-5 grid grid-cols-[1fr_auto] items-end gap-x-6 gap-y-3 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{dateLabel}</p>
          <h2 className="font-display text-4xl font-bold tracking-tight">{t("home.today")}</h2>
        </div>
        {/* Bezpečné (bez virů), jednoduché, vše pod kontrolou – v rovině s nadpisem „Dnes“ */}
        <ValuePillars className="order-last col-span-2 pb-1.5 xl:order-none xl:col-span-1" />
        <div className="justify-self-end">
          <UserModeToggle />
        </div>
      </div>

      <div className="mb-10 grid gap-5 lg:grid-cols-3">
        {holdToday ? (
          // Kostry ve tvaru karet (příběh, dvě kolekce, aplikace dne)
          ["lg:col-span-2", "", "", "lg:col-span-2"].map((span, i) => (
            <div key={i} className={cn("min-h-[440px] animate-pulse rounded-3xl bg-surface-2", span)} />
          ))
        ) : (
          <>
            {today.storyEntry && (
              <AppStoryCard story={today.story} entry={today.storyEntry} className="lg:col-span-2" paging={paging("story")} />
            )}
            {firstCollection.entries.length > 0 && (
              <CollectionCard story={firstCollection.story} entries={firstCollection.entries} paging={paging("collection0")} />
            )}
            {secondCollection.entries.length > 0 && (
              <CollectionCard story={secondCollection.story} entries={secondCollection.entries} paging={paging("collection1")} />
            )}
            {/* Aplikace dne – jedna na celý den, bez listování */}
            {today.appOfDay && <AppOfTheDayCard entry={today.appOfDay} className="lg:col-span-2" />}
          </>
        )}
      </div>

      {/* Stav počítače: aktualizace, co spravuje Unibox, export / import, vyčištění */}
      <SystemStatus />

      {/* Režim Vývojář: nástroje pro vývojáře hned pod přehledem */}
      {devTools.length > 0 && (
        <div className="mb-8">
          <Shelf title={t("home.devTools")} icon={<Code className="size-5 text-accent" />}>
            {devTools.map((p) => (
              <ShelfItem key={p.id}>
                <PackageCard entry={p} />
              </ShelfItem>
            ))}
          </Shelf>
        </div>
      )}

      {/* Kolekce podle zaměření + vlastní sada sdílená odkazem */}
      <ProfileCollections />

      {/* Celoobrazovkový detail kolekce – otevírají ho karty kolekcí výše */}
      <CollectionModal />

      {/* ── Trendy / Populární / Nové / Aktualizované ────────────── */}
      <section className="mb-10">
        <div className="mb-5 grid grid-cols-4 rounded-full border border-line bg-surface-2 p-1" role="tablist">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "relative h-11 cursor-pointer rounded-full text-sm font-semibold transition-colors",
                tab === id ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {/* Posuvný ukazatel aktivní záložky */}
              {tab === id && (
                <motion.span
                  layoutId="home-tab-indicator"
                  className="absolute inset-0 rounded-full bg-surface shadow-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{t(`home.tabs.${id}`)}</span>
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-end gap-4">
          <Link to="/top" className="mr-auto text-sm font-medium text-accent hover:underline">
            {t("home.seeAll")}
          </Link>
          {/* Pořadí určuje záložka – nabízíme jen přepnutí mřížka / seznam */}
          <CollectionToolbar hideSort />
        </div>

        {/* Bez nového připojení při přepnutí záložky – seznam jen dostane jiné aplikace
            a drží výšku, takže stránka neposkočí nahoru */}
        <PackageCollection packages={tabItems} />
      </section>
    </>
  );
}
