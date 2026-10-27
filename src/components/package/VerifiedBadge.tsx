import { BadgeCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Modrá fajfka ověřeného vydavatele (vedle názvu aplikace).
 * Bílý obrys a fajfka, modrá výplň – čitelné na světlém i tmavém pozadí.
 */
export function VerifiedBadge({ size = 16, className }: { size?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span title={t("verified.tooltip")} className={cn("relative z-10 inline-flex shrink-0", className)}>
      <BadgeCheck
        role="img"
        aria-label={t("verified.label")}
        className="fill-sky-500 text-white"
        strokeWidth={2.2}
        style={{ width: size, height: size }}
      />
    </span>
  );
}

/**
 * Název s fajfkou přilepenou za poslední slovo (pro velké nadpisy, které se
 * zalamují): fajfka zůstane hned u textu – ne na pravém okraji bloku – a nikdy
 * nespadne sama na nový řádek.
 */
export function NameWithBadge({ name, verified, size }: { name: string; verified: boolean; size: number }) {
  if (!verified) return <>{name}</>;
  const split = name.lastIndexOf(" ") + 1;
  return (
    <>
      {name.slice(0, split)}
      <span className="whitespace-nowrap">
        {name.slice(split)}
        <VerifiedBadge size={size} className="ml-[0.22em] -translate-y-[0.16em] align-middle" />
      </span>
    </>
  );
}
