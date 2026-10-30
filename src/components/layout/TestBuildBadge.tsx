import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isTestBuild } from "@/lib/tauri";
import { cn } from "@/lib/utils";

/** Oranžový štítek „Testovací verze“ – jen ve vývojovém sestavení desktopové aplikace (tauri dev). */
export function TestBuildBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  if (!isTestBuild()) return null;
  return (
    <span
      className={cn(
        "pointer-events-none flex w-fit items-center gap-1 rounded-full bg-orange-500 px-2 text-[10px] leading-4 font-semibold text-white shadow-sm",
        className,
      )}
    >
      <AlertTriangle className="size-3" />
      {t("app.testBuild")}
    </span>
  );
}
