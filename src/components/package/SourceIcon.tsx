import { Cog, Croissant, Grid2x2, IceCreamBowl, SquareArrowDown, SquareTerminal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceId } from "@/types";

/**
 * Jednobarevné ikony správců (po vzoru UniGetUI): obecný symbol z Lucide,
 * nebo krátká zkratka tam, kde se žádný symbol nehodí (npm, .NET…).
 */
const ICONS: Record<SourceId, LucideIcon | string> = {
  winget: SquareArrowDown,
  chocolatey: Grid2x2,
  scoop: IceCreamBowl,
  npm: "npm",
  bun: Croissant,
  pip: "py",
  cargo: Cog,
  vcpkg: "C++",
  dotnet: ".NET",
  pwsh: SquareTerminal,
  powershell: SquareTerminal,
};

export function SourceIcon({ source, className }: { source: SourceId; className?: string }) {
  const icon = ICONS[source];
  if (typeof icon === "string") {
    return (
      <span
        aria-hidden
        className={cn("inline-flex size-5 items-center justify-center text-[10px] leading-none font-black tracking-tight", className)}
      >
        {icon}
      </span>
    );
  }
  const Icon = icon;
  return <Icon aria-hidden className={cn("size-5", className)} />;
}
