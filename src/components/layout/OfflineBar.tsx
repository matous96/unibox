/**
 * Lišta pod horní lištou, když počítač ztratí připojení k internetu: říká,
 * co funguje dál (nainstalované aplikace, uložený katalog) a co počká na
 * připojení. Po návratu připojení sama zmizí a zastaralá data se načtou znovu
 * (TanStack Query – refetchOnReconnect).
 */
import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const isOnline = () => navigator.onLine;

/** Je počítač připojený k síti? (navigator.onLine – false znamená jistě offline) */
export function useOnline() {
  return useSyncExternalStore(subscribe, isOnline);
}

export function OfflineBar() {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;

  return (
    <div role="status" className="flex items-center gap-3 border-b border-line bg-amber-500/10 px-6 py-2 text-sm lg:px-8 2xl:px-10">
      <WifiOff className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{t("offline.title")}</span>
        <span className="text-muted">
          {" · "}
          {t("offline.text")}
        </span>
      </p>
    </div>
  );
}
