import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/States";
import { useAdminPendingUpdates } from "@/hooks/useInstalledItems";
import { runAdminBatch } from "@/services/adminBatch";
import { updateOptionsFor } from "@/store/installOptions";
import { useBusyAppIds } from "@/store/jobs";
import { useSecurity } from "@/store/security";

/** Kolik názvů aplikací vypsat, zbytek jako „+ další“. */
const NAMES = 4;

/**
 * „Čeká na potvrzení“ v Dostupných aktualizacích: aktualizace, které automatika odložila,
 * protože potřebují práva správce (na pozadí se dialog UAC neotevírá). Jedním tlačítkem
 * se spustí všechny najednou s jediným dialogem UAC (services/adminBatch.ts).
 */
export function AdminPendingPanel() {
  const { t } = useTranslation();
  const items = useAdminPendingUpdates();
  const busy = useBusyAppIds();
  const prohibited = useSecurity((s) => s.elevationProhibited);
  const [running, setRunning] = useState(false);
  if (!items.length) return null;

  const waiting = items.filter(({ entry }) => !busy.has(entry.id));
  const names = items.map(({ entry }) => entry.name);
  const shown = names.slice(0, NAMES).join(", ") + (names.length > NAMES ? ` +${names.length - NAMES}` : "");

  const run = async () => {
    setRunning(true);
    try {
      await runAdminBatch(
        waiting.map(({ pkg, entry }) => ({
          appId: entry.id,
          appName: entry.name,
          source: pkg.source,
          packageId: pkg.packageId,
          kind: "update" as const,
          options: { ...updateOptionsFor(entry.id, pkg, entry), asAdmin: true },
        })),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <section
      aria-label={t("autoUpdates.pendingTitle", { n: items.length })}
      className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3"
    >
      <ShieldAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-semibold">{t("autoUpdates.pendingTitle", { n: items.length })}</p>
        <p className="text-xs text-muted">{t("autoUpdates.pendingText")}</p>
        <p className="mt-1 truncate text-xs text-fg/80" title={names.join(", ")}>
          {shown}
        </p>
      </div>
      {prohibited ? (
        <p className="text-xs text-muted">{t("installOptions.asAdminProhibited")}</p>
      ) : (
        <Button onClick={() => void run()} disabled={running || waiting.length === 0}>
          {running ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" />}
          {t("autoUpdates.pendingAction")}
        </Button>
      )}
    </section>
  );
}
