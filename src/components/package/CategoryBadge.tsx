import { useTranslation } from "react-i18next";
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/utils";

/**
 * Kategorie aplikace na kartě a v řádku (ikona jako v postranním panelu + název),
 * ať je hned vidět, k čemu aplikace slouží, i když ji uživatel nezná.
 */
export function CategoryBadge({ category, className }: { category: string | undefined; className?: string }) {
  const { t } = useTranslation();
  const def = category ? getCategory(category) : undefined;
  if (!def) return null;
  const Icon = def.icon;
  const label = t(`categories.${def.id}`);
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted",
        className,
      )}
      title={label}
    >
      <Icon className="size-3 shrink-0 text-accent" />
      <span className="truncate">{label}</span>
    </span>
  );
}
