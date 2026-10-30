/**
 * Propojení s desktopem (jen v Tauri):
 *  - chování zavření okna (do oznamovací oblasti / ukončit),
 *  - texty nabídky ikony v oznamovací oblasti v jazyce aplikace – položka
 *    aktualizací i popisek ukazují jejich počet („HubGet – 4 aktualizace“),
 *  - stav na ikoně: barevná tečka (operace z useTrayStatus, oranžová = čekají
 *    aktualizace; v Nastavení jde vypnout) a popisek,
 *  - rychlé odkazy z nabídky ikony (Procházet balíčky, Dostupné aktualizace,
 *    Nainstalované) – backend pošle stránku, aplikace na ni přejde,
 *  - kontrola nové verze HubGetu chvíli po spuštění (jen sestavená aplikace,
 *    lze vypnout v Nastavení).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { isTauri } from "@/lib/tauri";
import { useAppUpdate } from "@/store/appUpdate";
import { useSettings } from "@/store/settings";
import { useUpdates } from "./useInstalledItems";
import { useTrayStatus } from "./useTrayStatus";

export function useDesktopIntegration() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const closeToTray = useSettings((s) => s.closeToTray);
  const trayBadge = useSettings((s) => s.trayBadge);
  const updates = useUpdates().updatable.length;
  const tray = useTrayStatus();
  // Probíhající operace a jejich výsledek mají přednost před čekajícími aktualizacemi
  const badge = !trayBadge ? "idle" : tray.status === "idle" && updates > 0 ? "updates" : tray.status;

  useEffect(() => {
    if (isTauri()) invoke("set_close_to_tray", { enabled: closeToTray }).catch(() => undefined);
  }, [closeToTray]);

  useEffect(() => {
    if (isTauri()) invoke("set_tray_status", { status: badge }).catch(() => undefined);
  }, [badge]);

  useEffect(() => {
    if (!isTauri()) return;
    // Popisek: probíhající operace a jejich výsledek mají přednost před počtem aktualizací
    const tooltip =
      tray.status === "busy"
        ? tray.running
          ? t("tray.tooltipBusy", { count: tray.running })
          : t("tray.tooltipChecking")
        : tray.status !== "idle"
          ? t(tray.status === "error" ? "tray.tooltipError" : "tray.tooltipDone")
          : updates
            ? t("tray.tooltipUpdates", { count: updates })
            : "HubGet";
    const labels = {
      browse: t("tray.browse"),
      updates: updates ? t("tray.updatesCount", { count: updates }) : t("tray.updates"),
      installed: t("tray.installed"),
      show: t("tray.show"),
      quit: t("tray.quit"),
      tooltip,
    };
    invoke("set_tray_labels", { labels }).catch(() => undefined);
  }, [t, i18n.language, updates, tray.status, tray.running, tray.checking]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<string>("tray-navigate", (event) => navigate(event.payload));
    return () => void unlisten.then((stop) => stop());
  }, [navigate]);

  // Nová verze HubGetu: kontrola 8 s po spuštění (ať nezdržuje načtení katalogu)
  useEffect(() => {
    if (!isTauri() || !import.meta.env.PROD || !useAppUpdate.getState().autoCheck) return;
    const timer = setTimeout(() => void useAppUpdate.getState().check(false), 8000);
    return () => clearTimeout(timer);
  }, []);
}
