import { Check, ChevronDown, Cpu } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeviceArch } from "@/hooks/useDeviceArch";
import { useDismiss } from "@/hooks/useDismiss";
import { ARCH_LABEL, ARCHES, type ArchFilterValue } from "@/lib/arch";
import { cn } from "@/lib/utils";
import { useSettings } from "@/store/settings";

/**
 * Filtr podle platformy (x64 / ARM64 / x86). Volba se pamatuje v nastavení a platí
 * v hledání, kategoriích i žebříčku; platforma tohoto počítače je v nabídce označená.
 */
export function ArchFilter() {
  const { t } = useTranslation();
  const value = useSettings((s) => s.archFilter);
  const setValue = useSettings((s) => s.setArchFilter);
  const device = useDeviceArch();
  const [open, setOpen] = useState(false);
  // Nabídka se otevře na stranu, kde je víc místa (filtr bývá vlevo i vpravo)
  const [alignRight, setAlignRight] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, () => setOpen(false));

  const toggle = () => {
    const rect = root.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left > window.innerWidth / 2);
    setOpen(!open);
  };
  const label = (v: ArchFilterValue) => (v === "all" ? t("filters.allArches") : ARCH_LABEL[v]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("filters.archLabel")}
        title={t("filters.archLabel")}
        onClick={toggle}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
          value !== "all" ? "border-accent/30 bg-accent/12 text-accent" : "border-line bg-surface-2 text-fg hover:bg-surface-3",
        )}
      >
        <Cpu className={cn("size-4", value === "all" && "text-muted")} />
        {label(value)}
        <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute top-full z-30 mt-2 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-card-hover",
            alignRight ? "right-0" : "left-0",
          )}
        >
          {(["all", ...ARCHES] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onClick={() => {
                setValue(option);
                setOpen(false);
              }}
              className={cn(
                "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2",
                value === option && "bg-accent/12 hover:bg-accent/12",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("flex items-center gap-2 text-sm font-medium", value === option && "font-semibold text-accent")}>
                  {label(option)}
                  {option === device && (
                    <span className="rounded-full bg-surface-3 px-1.5 text-[10px] leading-4 font-semibold text-muted">
                      {t("filters.thisDevice")}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted">
                  {option === "all" ? t("filters.allArchesHint") : t(`arch.desc_${option}`)}
                </span>
              </span>
              {value === option && <Check className="mt-0.5 size-4 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Poznámka, kolik výsledků filtr platformy skryl, s tlačítkem pro zrušení filtru. */
export function ArchHiddenNote({ hidden }: { hidden: number }) {
  const { t } = useTranslation();
  const value = useSettings((s) => s.archFilter);
  const setValue = useSettings((s) => s.setArchFilter);
  if (value === "all" || hidden === 0) return null;
  return (
    <p role="status" className="mb-4 flex flex-wrap items-center gap-x-2 text-sm text-muted">
      <Cpu className="size-4 shrink-0" />
      {t("filters.hiddenByArch", { arch: ARCH_LABEL[value], hidden })}
      <button type="button" onClick={() => setValue("all")} className="cursor-pointer font-medium text-accent hover:underline">
        {t("filters.showAllArches")}
      </button>
    </p>
  );
}
