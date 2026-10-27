import { ChevronDown, Code, ExternalLink, Plus, Settings2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { GitHubIcon } from "@/components/ui/BrandIcons";
import { NEW_SOURCE_URL } from "@/config";
import { useDismiss } from "@/hooks/useDismiss";
import { useInstallableStats } from "@/hooks/usePackages";
import { cn, formatCompactCount } from "@/lib/utils";
import { getSource, SOURCES, type SourceMeta } from "@/services/managers";
import { useSettings } from "@/store/settings";
import { isDevLock, useSourceLock, useSourceScope } from "@/store/sourceLock";
import { useToasts } from "@/store/toasts";

/** Správci balíčků, o kterých se uvažuje jako o dalších zdrojích (jen ukázka v nabídce). */
const SOURCE_IDEAS = ["WSL", "Conda", "Go", "RubyGems", "Flatpak (WSL)"];

/** Stránky s katalogem, kde zámek zdroje filtruje; odjinud se po zamčení přejde na Domů. */
const CATALOG_PAGES = /^\/($|categories|top|search|recent|favorites|package\/|app\/)/;

/** Klíč v localStorage pro rozbalení skupiny „Pro vývojáře“. */
const DEV_OPEN_KEY = "unibox-sources-dev-open";

/**
 * Sekce „Zdroje balíčků“ v levém panelu nad Nastavením: řádek pro každého
 * správce aplikací (tečka, název, počet / vypnuto), pod nimi sbalitelná
 * skupina správců pro vývojáře a „+ Přidat zdroj“.
 */
export function SourcesPanel() {
  const { t } = useTranslation();
  const enabled = useSettings((s) => s.enabledSources);
  const [devOpen, setDevOpen] = useState(() => {
    try {
      return localStorage.getItem(DEV_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const appSources = SOURCES.filter((s) => s.group === "apps");
  const devSources = SOURCES.filter((s) => s.group === "dev");
  const devEnabled = devSources.filter((s) => enabled.includes(s.id)).length;
  // Zamčený správce pro vývojáře je vidět i na sbalené skupině
  const { lock } = useSourceScope();
  const devLocked = isDevLock(lock);

  const toggleDev = () => {
    setDevOpen(!devOpen);
    try {
      localStorage.setItem(DEV_OPEN_KEY, devOpen ? "0" : "1");
    } catch {
      /* úložiště nedostupné – stav se jen nezapamatuje */
    }
  };

  return (
    <div className="border-t border-line px-3 pt-3 pb-1">
      <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{t("community.sources")}</p>
      <div className="flex flex-col gap-0.5">
        {appSources.map((s) => (
          <SourceRow key={s.id} source={s} />
        ))}

        {/* Správci pro vývojáře – sbalení, ať panel nezabere půl výšky okna */}
        <button
          type="button"
          aria-expanded={devOpen}
          onClick={toggleDev}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-[5px] text-sm transition-colors hover:bg-surface/60",
            devLocked && !devOpen ? "font-semibold text-accent" : "text-fg/85",
          )}
        >
          <Code className={cn("size-3.5 shrink-0", devLocked && !devOpen ? "text-accent" : "text-muted")} />
          <span className="flex-1 truncate text-left">
            {t("sources.group.dev")}
            {devLocked && !devOpen && <span className="font-normal"> · {getSource(lock).label}</span>}
          </span>
          <span className="text-[11px] text-muted tabular-nums">
            {devEnabled}/{devSources.length}
          </span>
          <ChevronDown className={cn("size-3.5 text-muted transition-transform", devOpen && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {devOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col gap-0.5 overflow-hidden pl-3"
            >
              {devSources.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AddSourceButton />
      </div>
    </div>
  );
}

/**
 * Řádek zdroje: tečka, název a počet balíčků (nebo „vypnuto“). U zapnutého
 * správce klik zamkne katalog na tento zdroj – opakovaný klik zámek zruší
 * (store/sourceLock.ts). Správce pro vývojáře přitom zapne režim Vývojář
 * (jeho balíčky jinde nejsou vidět). Vypnutý zdroj vede do Nastavení.
 */
function SourceRow({ source: s }: { source: SourceMeta }) {
  const { t } = useTranslation();
  const on = useSettings((st) => st.enabledSources.includes(s.id));
  const language = useSettings((st) => st.language);
  const developer = useSettings((st) => st.userMode === "developer");
  const setUserMode = useSettings((st) => st.setUserMode);
  const count = useInstallableStats().bySource[s.id];
  // Platný zámek (zámek správce pro vývojáře mimo režim Vývojář neplatí)
  const locked = useSourceScope().lock === s.id;
  const select = useSourceLock((st) => st.select);
  const clear = useSourceLock((st) => st.clear);
  const pushToast = useToasts((st) => st.push);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dev = s.group === "dev";
  const lockable = on;

  const content = (
    <>
      <span className={cn("size-2 shrink-0 rounded-full", s.dot, !on && "opacity-40")} />
      <span className="flex-1 truncate text-left">{s.label}</span>
      <span className={cn("text-[11px] tabular-nums", locked ? "text-accent" : "text-muted")}>
        {on ? (count !== undefined ? formatCompactCount(count, language) : "") : t("community.off")}
      </span>
    </>
  );
  const rowClass = "flex items-center gap-3 rounded-xl px-3 py-[5px] text-sm transition-colors";

  if (!lockable) {
    return (
      <Link to="/settings" title={t("community.sourcesTitle")} className={cn(rowClass, "hover:bg-surface/60", on ? "text-fg/85" : "text-muted")}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={locked}
      title={locked ? t("sourceLock.unlockHint") : t(dev ? "sourceLock.lockHintDev" : "sourceLock.lockHint", { source: s.label })}
      onClick={() => {
        if (locked) return clear();
        if (dev && !developer) {
          setUserMode("developer");
          pushToast("info", t("sourceLock.developerOn"));
        }
        // Při zamčení ukázat filtrovaný katalog (z Nastavení, historie… na domovskou stránku)
        if (!CATALOG_PAGES.test(pathname)) navigate("/");
        select(s.id);
      }}
      className={cn(
        rowClass,
        "cursor-pointer",
        locked ? "bg-accent/12 font-semibold text-accent" : "text-fg/85 hover:bg-surface/60",
      )}
    >
      {content}
    </button>
  );
}

/** Řádek „+ Přidat zdroj“ s nabídkou otevíranou nahoru (panel je u spodního okraje). */
function AddSourceButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, () => setOpen(false));

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3 py-[5px] text-sm font-medium transition-colors",
          open ? "border-accent bg-accent/12 text-accent" : "border-accent/40 text-accent hover:bg-accent/10",
        )}
      >
        <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
        {t("community.addSource")}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-40 mb-2 w-80 origin-bottom-left rounded-2xl border border-line bg-surface p-5 shadow-card-hover"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-6 items-center justify-center rounded-full bg-accent/12 text-accent">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
              {t("community.addSource")}
            </p>
            <p className="mt-2 text-sm text-muted">{t("community.addSourceText")}</p>

            <p className="mt-4 mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">{t("community.ideas")}</p>
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_IDEAS.map((idea) => (
                <span key={idea} className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted">
                  {idea}
                </span>
              ))}
            </div>

            <p className="mt-4 text-xs text-muted">{t("community.devHint")}</p>

            <div className="mt-4 flex flex-col gap-2">
              <a
                href={NEW_SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:brightness-110"
              >
                <GitHubIcon className="size-4" />
                {t("community.suggest")}
                <ExternalLink className="size-3.5 opacity-70" />
              </a>
              <Link
                to="/settings"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-line bg-surface-2 px-4 text-sm font-semibold transition-colors hover:bg-surface-3"
              >
                <Settings2 className="size-4" />
                {t("community.manage")}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
