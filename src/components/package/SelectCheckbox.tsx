import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSelection } from "@/store/selection";
import type { CatalogEntry } from "@/types";

/**
 * Zaškrtávátko pro hromadný výběr v levém horním rohu karty / řádku (nad
 * ikonou). Je vidět po najetí myší, u vybrané aplikace a vždy, když je něco
 * vybrané – pak jde výběr klikáním rychle doplnit.
 */
export function SelectCheckbox({ entry, className }: { entry: CatalogEntry; className?: string }) {
  const { t } = useTranslation();
  const selected = useSelection((s) => !!s.items[entry.id]);
  const active = useSelection((s) => Object.keys(s.items).length > 0);
  const toggle = useSelection((s) => s.toggle);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={t("selection.select", { name: entry.name })}
      title={t("selection.select", { name: entry.name })}
      onClick={(e) => {
        e.preventDefault(); // neotevírat detail (odkaz přes celou kartu)
        toggle(entry);
      }}
      className={cn(
        "z-10 flex size-5 cursor-pointer items-center justify-center rounded-md border-2 shadow-sm transition-all",
        selected
          ? "border-accent bg-accent text-accent-fg opacity-100"
          : "border-muted/60 bg-surface/95 hover:border-accent group-hover:opacity-100 focus-visible:opacity-100",
        !selected && !active && "opacity-0",
        className,
      )}
    >
      {selected && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}
