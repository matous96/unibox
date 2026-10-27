/**
 * Úvodní průvodce pro nové uživatele (store/onboarding.ts): při prvním spuštění
 * po instalaci se sám ukáže a v pěti krocích představí Unibox – univerzální
 * katalog, filtrování podle zdroje, pokročilou odinstalaci a správu po spuštění
 * se zálohami. Každý krok má vlevo ukázku (zjednodušený výřez aplikace),
 * vpravo popis. Další / Předchozí (i šipkami), tečky pro skok na krok,
 * „Přeskočit úvod“ (i Esc). Znovu ho spustí Nastavení → Obecné.
 */
import {
  ArrowRight,
  Check,
  FileJson,
  FileCode2,
  FolderOpen,
  KeyRound,
  Link2,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/settings/SettingsUi";
import { SourceIcon } from "@/components/package/SourceIcon";
import { Button } from "@/components/ui/Button";
import { UniboxLogo } from "@/components/ui/Logo";
import { useInstallableStats } from "@/hooks/usePackages";
import { isTauri } from "@/lib/tauri";
import { cn, formatAppCount } from "@/lib/utils";
import { getSource } from "@/services/managers";
import { useOnboarding } from "@/store/onboarding";
import { useSettings } from "@/store/settings";
import type { SourceId } from "@/types";

const STEPS = ["welcome", "catalog", "filter", "uninstall", "startup"] as const;
type Step = (typeof STEPS)[number];

/** Průvodce počká, až se okno po spuštění vykreslí a usadí. */
const SHOW_DELAY = 900;
const APP_SOURCES: SourceId[] = ["winget", "chocolatey", "scoop"];

export function OnboardingDialog() {
  const { t } = useTranslation();
  const open = useOnboarding((s) => s.open);
  const complete = useOnboarding((s) => s.complete);
  // [krok, směr posunu pro animaci]
  const [[index, direction], setPage] = useState<[number, number]>([0, 1]);
  const step: Step = STEPS[index];
  const last = index === STEPS.length - 1;

  // První spuštění po instalaci → ukázat sám (jen v desktopové aplikaci)
  useEffect(() => {
    if (!isTauri() || useOnboarding.getState().hasCompletedOnboarding) return;
    const timer = setTimeout(() => useOnboarding.getState().show(), SHOW_DELAY);
    return () => clearTimeout(timer);
  }, []);

  // Při každém otevření od začátku
  useEffect(() => {
    if (open) setPage([0, 1]);
  }, [open]);

  const go = useCallback((next: number) => {
    setPage(([current]) => (next < 0 || next >= STEPS.length ? [current, 0] : [next, next > current ? 1 : -1]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") complete();
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, go, complete]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={t("onboarding.title")}
            className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card-hover"
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <button
              type="button"
              onClick={complete}
              aria-label={t("onboarding.skip")}
              className="absolute top-4 right-4 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-4" />
            </button>

            <div className="relative min-h-0 flex-1 overflow-y-auto">
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  initial={{ opacity: 0, x: direction * 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -40 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="grid md:grid-cols-[1.1fr_1fr]"
                >
                  {/* Ukázka */}
                  <div className="relative flex min-h-64 items-center justify-center overflow-hidden bg-gradient-to-br from-accent/25 via-accent/8 to-transparent p-8 md:min-h-[29rem]">
                    <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-accent/20 blur-3xl" />
                    <div className="relative w-full max-w-sm">
                      <Visual step={step} />
                    </div>
                  </div>
                  {/* Popis */}
                  <StepText step={step} index={index} />
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
              {/* Na posledním kroku jen skryté – tečky zůstanou na místě */}
              <button
                type="button"
                onClick={complete}
                tabIndex={last ? -1 : undefined}
                aria-hidden={last || undefined}
                className={cn("cursor-pointer text-sm font-medium text-muted transition-colors hover:text-fg", last && "invisible")}
              >
                {t("onboarding.skip")}
              </button>
              {/* Tečky – průběh a skok na krok */}
              <div className="mx-auto flex items-center gap-1.5">
                {STEPS.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={t("onboarding.stepOf", { current: i + 1, total: STEPS.length })}
                    aria-current={i === index ? "step" : undefined}
                    onClick={() => go(i)}
                    className={cn(
                      "h-2 cursor-pointer rounded-full transition-all",
                      i === index ? "w-6 bg-accent" : "w-2 bg-surface-3 hover:bg-muted/50",
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {index > 0 && (
                  <Button variant="secondary" onClick={() => go(index - 1)}>
                    {t("onboarding.prev")}
                  </Button>
                )}
                <Button onClick={() => (last ? complete() : go(index + 1))} autoFocus>
                  {last ? t("onboarding.finish") : t("onboarding.next")}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Pravá část kroku: pořadí, nadpis, text a body (u odinstalace i přepínač). */
function StepText({ step, index }: { step: Step; index: number }) {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const advancedUninstall = useSettings((s) => s.advancedUninstall);
  const setAdvancedUninstall = useSettings((s) => s.setAdvancedUninstall);
  const stats = useInstallableStats();
  // „Přes 25 000 aplikací“ – zaokrouhleno dolů na tisíce
  const count = formatAppCount(stats.loaded && stats.total >= 1000 ? Math.floor(stats.total / 1000) * 1000 : 25_000, language);
  const points = [1, 2, 3].map((n) => t(`onboarding.${step}.point${n}`, { count })).filter(Boolean);

  return (
    <div className="flex flex-col justify-center gap-4 p-8 md:pr-12">
      <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
        {t("onboarding.stepOf", { current: index + 1, total: STEPS.length })}
      </p>
      <h2 className="font-display text-3xl font-bold tracking-tight">{t(`onboarding.${step}.title`)}</h2>
      <p className="text-[15px] leading-relaxed text-muted">{t(`onboarding.${step}.text`)}</p>
      <ul className="flex flex-col gap-2">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5 text-sm">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Check className="size-3" strokeWidth={3} />
            </span>
            {point}
          </li>
        ))}
      </ul>
      {/* Pokročilou odinstalaci jde zapnout rovnou (jinak Nastavení → Obecné) */}
      {step === "uninstall" && isTauri() && (
        <label className="mt-1 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2 px-4 py-3">
          <span>
            <span className="block text-sm font-medium">{t("onboarding.uninstall.toggle")}</span>
            <span className="block text-xs text-muted">{t("onboarding.uninstall.toggleHint")}</span>
          </span>
          <Switch checked={advancedUninstall} onChange={setAdvancedUninstall} label={t("onboarding.uninstall.toggle")} />
        </label>
      )}
      {step === "startup" && <p className="text-xs text-muted">{t("onboarding.startup.where")}</p>}
    </div>
  );
}

function Visual({ step }: { step: Step }) {
  switch (step) {
    case "welcome":
      return <WelcomeVisual />;
    case "catalog":
      return <CatalogVisual />;
    case "filter":
      return <FilterVisual />;
    case "uninstall":
      return <UninstallVisual />;
    case "startup":
      return <StartupVisual />;
  }
}

/** Panel ukázky – zjednodušený výřez aplikace. */
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-line bg-surface p-4 shadow-card", className)}>{children}</div>;
}

function WelcomeVisual() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="rounded-[22px] shadow-2xl shadow-accent/40">
        <UniboxLogo size={112} />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {[ShieldCheck, Search, Check].map((Icon, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-xs font-medium shadow-sm">
            <Icon className="size-3.5 text-accent" />
            {t(`onboarding.welcome.pill${i + 1}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function SourceChip({ source, active }: { source: SourceId; active?: boolean }) {
  const meta = getSource(source);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm",
        active ? "border-accent/40 bg-accent/12 text-accent" : "border-line bg-surface",
      )}
    >
      <SourceIcon source={source} className="size-3.5" />
      {meta.label}
      <span className={cn("size-2 rounded-full", meta.dot)} />
    </span>
  );
}

function CatalogVisual() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {APP_SOURCES.map((s) => (
          <SourceChip key={s} source={s} />
        ))}
      </div>
      {/* Tři zdroje se slijí do jedné karty */}
      <svg viewBox="0 0 200 36" className="h-9 w-48 text-accent/60" aria-hidden>
        <path d="M30 2 C30 22 100 14 100 34 M100 2 V34 M170 2 C170 22 100 14 100 34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <Panel className="w-full">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-orange-500 text-lg font-black text-white">▶</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">VLC media player</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              VideoLAN
              {APP_SOURCES.map((s) => (
                <span key={s} className={cn("size-1.5 rounded-full", getSource(s).dot)} />
              ))}
            </p>
          </div>
          <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">{t("onboarding.mock.install")}</span>
        </div>
      </Panel>
    </div>
  );
}

function FilterVisual() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-accent/10 px-3 py-2 text-xs shadow-sm">
        <span className={cn("size-2 rounded-full", getSource("winget").dot)} />
        <span className="flex-1 font-semibold">{t("onboarding.mock.onlyWinget")}</span>
        <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold">{t("onboarding.mock.showAll")}</span>
      </div>
      <Panel className="relative p-3">
        <p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">{t("community.sources")}</p>
        {APP_SOURCES.map((s, i) => (
          <div
            key={s}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
              i === 0 ? "bg-accent/12 font-semibold text-accent" : "text-fg/85",
            )}
          >
            <span className={cn("size-2 rounded-full", getSource(s).dot)} />
            <span className="flex-1">{getSource(s).label}</span>
            <span className="text-[11px] tabular-nums opacity-80">{["15 776", "12 027", "4 702"][i]}</span>
          </div>
        ))}
        {/* Kurzor nad zamčeným zdrojem */}
        <svg viewBox="0 0 24 24" className="absolute top-[3.4rem] right-16 size-6 drop-shadow" aria-hidden>
          <path d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18 13.5 Z" fill="white" stroke="black" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </Panel>
    </div>
  );
}

function UninstallVisual() {
  const { t } = useTranslation();
  const rows: [LucideIcon, string][] = [
    [FolderOpen, "%AppData%\\Example"],
    [FolderOpen, "C:\\Program Files\\Example"],
    [KeyRound, "HKCU\\Software\\Example"],
    [Link2, t("onboarding.mock.shortcut")],
  ];
  return (
    <Panel>
      <p className="mb-3 text-sm font-semibold">{t("onboarding.mock.leftovers")}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map(([Icon, label]) => (
          <div key={label} className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-2.5 py-2 text-xs">
            <span className="flex size-4 items-center justify-center rounded bg-accent text-accent-fg">
              <Check className="size-3" strokeWidth={3} />
            </span>
            <Icon className="size-3.5 shrink-0 text-muted" />
            <span className="truncate font-mono">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger">
          <Trash2 className="size-3.5" />
          {t("onboarding.mock.toRecycleBin")}
        </span>
      </div>
    </Panel>
  );
}

function StartupVisual() {
  const { t } = useTranslation();
  const items: [string, "high" | "medium" | "low", boolean][] = [
    ["Spotify", "high", false],
    ["OneDrive", "medium", true],
    ["Discord", "low", true],
  ];
  const impact = { high: "bg-danger/12 text-danger", medium: "bg-amber-500/15 text-amber-600 dark:text-amber-300", low: "bg-success/12 text-success" };
  const actions: [LucideIcon, string][] = [
    [FileJson, t("onboarding.mock.exportJson")],
    [FileCode2, t("onboarding.mock.exportHtml")],
    [Upload, t("onboarding.mock.import")],
  ];
  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-3">
        {items.map(([name, level, on]) => (
          <div key={name} className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold">{name[0]}</span>
            <span className="flex-1 text-sm font-medium">{name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", impact[level])}>{t(`onboarding.mock.impact_${level}`)}</span>
            <span className={cn("relative inline-flex h-5 w-9 items-center rounded-full", on ? "bg-accent" : "bg-surface-3")}>
              <span className={cn("inline-block size-4 rounded-full bg-white shadow", on ? "translate-x-[18px]" : "translate-x-0.5")} />
            </span>
          </div>
        ))}
      </Panel>
      <div className="flex gap-2">
        {actions.map(([Icon, label]) => (
          <span key={label} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-2 text-xs font-semibold shadow-sm">
            <Icon className="size-3.5 text-accent" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
