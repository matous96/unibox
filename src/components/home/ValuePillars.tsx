import { MousePointerClick, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UniboxLogo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

interface Pillar {
  Icon: LucideIcon;
  title: string;
  /** Podrobnější vysvětlení – zobrazí se jako bublina po najetí myší. */
  text: string;
  /** Barva ikony. */
  tone: string;
}

/**
 * Minimalistický řádek nahoře na domovské stránce: „Obchod s aplikacemi
 * pro Windows“ a tři hlavní sliby – bezpečné (bez virů), jednoduché,
 * vše pod kontrolou. Podrobnosti jsou v bublině po najetí myší.
 */
export function ValuePillars({ className }: { className?: string }) {
  const { t } = useTranslation();

  const pillars: Pillar[] = [
    { Icon: ShieldCheck, title: t("hero.safeTitle"), text: t("hero.safeText"), tone: "text-emerald-500" },
    { Icon: MousePointerClick, title: t("hero.simpleTitle"), text: t("hero.simpleText"), tone: "text-accent" },
    { Icon: RefreshCw, title: t("hero.manageTitle"), text: t("hero.manageText"), tone: "text-violet-400" },
  ];

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm", className)}>
      {/* Nadpis „Obchod s aplikacemi pro Windows“ jen tam, kde je místo (jinak se řádek nevejde vedle „Dnes“) */}
      <span className="hidden items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted uppercase 2xl:flex">
        <UniboxLogo size={16} className="rounded-[4px]" />
        {t("hero.eyebrow")}
      </span>
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {pillars.map(({ Icon, title, text, tone }) => (
          <li key={title} title={text} className="flex cursor-default items-center gap-1.5 font-medium text-fg/85">
            <Icon className={cn("size-4", tone)} />
            {title}
          </li>
        ))}
      </ul>
    </div>
  );
}
