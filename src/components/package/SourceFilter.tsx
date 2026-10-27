import { Check, ChevronDown, Layers } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDismiss } from "@/hooks/useDismiss";
import { cn } from "@/lib/utils";
import { getSource, ORIGINS } from "@/services/managers";
import { useSettings } from "@/store/settings";
import type { InstallOrigin, SourceId } from "@/types";
import { useOriginLabel } from "./SourceBadge";
import { SourceIcon } from "./SourceIcon";

export type SourceFilterValue = SourceId | "all";

interface SourceFilterProps {
  value: SourceFilterValue;
  onChange: (value: SourceFilterValue) => void;
}

/**
 * Filtr podle správce balíčků. Nabízí jen zapnuté správce; pokud je zapnutý
 * jediný, filtr se nezobrazí. Do tří správců segmentový přepínač
 * („Všichni správci / winget / Chocolatey / Scoop“), při více správcích
 * rozbalovací nabídka rozdělená na aplikace a nástroje pro vývojáře.
 */
export function SourceFilter({ value, onChange }: SourceFilterProps) {
  const { t } = useTranslation();
  const enabledSources = useSettings((s) => s.enabledSources);
  if (enabledSources.length < 2) return null;
  if (enabledSources.length > 3) return <SourceDropdown value={value} onChange={onChange} enabled={enabledSources} />;

  return (
    <div className="flex rounded-full border border-line bg-surface-2 p-0.5" role="group" aria-label={t("filters.sourceLabel")}>
      {(["all", ...enabledSources] as const).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors",
            value === id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {id !== "all" && <span className={cn("size-2 rounded-full", getSource(id).dot)} />}
          {id === "all" ? t("filters.allSources") : getSource(id).label}
        </button>
      ))}
    </div>
  );
}

/** Rozbalovací výběr správce (při více zapnutých správcích). */
function SourceDropdown({ value, onChange, enabled }: SourceFilterProps & { enabled: SourceId[] }) {
  const { t } = useTranslation();
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

  const pick = (id: SourceFilterValue) => {
    onChange(id);
    setOpen(false);
  };
  const groups = (["apps", "dev"] as const)
    .map((group) => ({ group, ids: enabled.filter((id) => getSource(id).group === group) }))
    .filter((g) => g.ids.length > 0);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("filters.sourceLabel")}
        onClick={toggle}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
          value !== "all" ? "border-accent/30 bg-accent/12 text-accent" : "border-line bg-surface-2 text-fg hover:bg-surface-3",
        )}
      >
        {value === "all" ? (
          <Layers className="size-4 text-muted" />
        ) : (
          <span className={cn("size-2 rounded-full", getSource(value).dot)} />
        )}
        {value === "all" ? t("filters.allSources") : getSource(value).label}
        <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute top-full z-30 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-card-hover",
            alignRight ? "right-0" : "left-0",
          )}
        >
          <Option active={value === "all"} onClick={() => pick("all")}>
            <Layers className="size-4 text-muted" />
            {t("filters.allSources")}
          </Option>
          {groups.map(({ group, ids }) => (
            <div key={group}>
              <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
                {t(`sources.group.${group}`)}
              </p>
              {ids.map((id) => (
                <Option key={id} active={value === id} onClick={() => pick(id)}>
                  <SourceIcon source={id} className="size-4 text-muted" />
                  <span className="flex-1">{getSource(id).label}</span>
                  <span className={cn("size-2 rounded-full", getSource(id).dot)} />
                </Option>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Option({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-2",
        active && "bg-accent/12 font-semibold text-accent hover:bg-accent/12",
      )}
    >
      {children}
      {active && <Check className="size-3.5" />}
    </button>
  );
}

export type OriginFilterValue = InstallOrigin | "all";

interface OriginFilterProps {
  value: OriginFilterValue;
  onChange: (value: OriginFilterValue) => void;
  /** Počty nainstalovaných aplikací podle původu; nabídnou se jen nenulové. */
  counts: Partial<Record<InstallOrigin, number>>;
}

/**
 * Filtr nainstalovaných aplikací podle přesného původu instalace
 * („WinGet: winget“, „WinGet: msstore“, „npm“, „Steam“, „Lokální“…) s počty.
 */
export function OriginFilter({ value, onChange, counts }: OriginFilterProps) {
  const { t } = useTranslation();
  const label = useOriginLabel();
  const present = ORIGINS.filter((o) => (counts[o.id] ?? 0) > 0);
  if (present.length < 2) return null;
  const total = present.reduce((sum, o) => sum + (counts[o.id] ?? 0), 0);

  const options: { id: OriginFilterValue; text: string; count: number; dot?: string }[] = [
    { id: "all", text: t("filters.allOrigins"), count: total },
    ...present.map((o) => ({ id: o.id, text: label(o.id), count: counts[o.id] ?? 0, dot: o.dot })),
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filters.originLabel")}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
            value === o.id
              ? "border-accent/30 bg-accent/12 text-accent"
              : "border-line bg-surface text-muted hover:text-fg",
          )}
        >
          {o.dot && <span className={cn("size-2 rounded-full", o.dot)} />}
          {o.text}
          <span className="text-xs tabular-nums opacity-70">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

/** Odpovídá aplikace filtru? (Je dostupná u zvoleného správce.) */
export const matchesSource = (sources: { source: SourceId }[], filter: SourceFilterValue) =>
  filter === "all" || sources.some((s) => s.source === filter);
