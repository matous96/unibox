import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDeviceArch } from "@/hooks/useDeviceArch";
import { ARCH_LABEL, ARCHES, compatibility } from "@/lib/arch";
import { cn } from "@/lib/utils";
import type { Arch } from "@/types";

/**
 * Podporované architektury (čipy x64 / ARM64 / x86) a jak aplikace poběží
 * na tomto počítači: nativně, v emulaci, nebo vůbec.
 */
export function ArchitectureInfo({ architectures }: { architectures: Arch[] }) {
  const { t } = useTranslation();
  const device = useDeviceArch();
  const sorted = ARCHES.filter((a) => architectures.includes(a));
  const compat = device ? compatibility(device, sorted) : null;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((a) => (
          <span
            key={a}
            title={t(`arch.desc_${a}`)}
            className={cn(
              "rounded-md px-2 py-0.5 font-mono text-xs",
              a === device ? "bg-accent/15 text-accent ring-1 ring-accent/30" : "bg-surface-2 text-fg/80",
            )}
          >
            {ARCH_LABEL[a]}
          </span>
        ))}
      </div>

      {device && compat && (
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 text-xs",
            compat === "native" && "text-success",
            compat === "emulated" && "text-amber-600 dark:text-amber-400",
            compat === "unsupported" && "text-danger",
          )}
        >
          {compat === "native" && <CheckCircle2 className="size-3.5 shrink-0" />}
          {compat === "emulated" && <AlertTriangle className="size-3.5 shrink-0" />}
          {compat === "unsupported" && <XCircle className="size-3.5 shrink-0" />}
          {t(`arch.${compat}`, { device: ARCH_LABEL[device] })}
        </p>
      )}
    </div>
  );
}
