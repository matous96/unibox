/**
 * „Co je nového v Uniboxu“ – po spuštění nové verze (store/whatsNew.ts) ukáže
 * novinky vydání, která uživatel ještě neviděl. Tlačítkem Rozumím (i křížkem
 * nebo Esc) se aktuální verze uloží jako zobrazená. Sám se ukáže jen
 * v desktopové aplikaci; znovu ho otevře Nastavení → Novinky (useWhatsNewRequest).
 */
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CHANGELOG, type Release } from "@/data/changelog";
import { isTauri } from "@/lib/tauri";
import { APP_VERSION } from "@/services/updates";
import { unseenReleases, useWhatsNew, useWhatsNewRequest } from "@/store/whatsNew";
import { ReleaseList } from "./ReleaseList";

/** Dialog počká, až se okno vykreslí a usadí (start, obnovení relace). */
const SHOW_DELAY = 900;

export function WhatsNewDialog() {
  const { t } = useTranslation();
  const [releases, setReleases] = useState<Release[]>([]);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const { lastSeenVersion, markSeen } = useWhatsNew.getState();
    if (lastSeenVersion === APP_VERSION) return;
    const unseen = unseenReleases(lastSeenVersion, APP_VERSION);
    // Čistá instalace, návrat ke starší verzi nebo verze bez poznámek – jen zapamatovat
    if (!unseen.length) {
      markSeen(APP_VERSION);
      return;
    }
    const timer = setTimeout(() => {
      setReleases(unseen);
      setOpen(true);
    }, SHOW_DELAY);
    return () => clearTimeout(timer);
  }, []);

  // Ruční otevření (Nastavení → Novinky): novinky aktuální verze, jinak nejnovějšího vydání
  const requested = useWhatsNewRequest((s) => s.requested);
  useEffect(() => {
    if (!requested) return;
    const current = CHANGELOG.filter((release) => release.version === APP_VERSION);
    setReleases(current.length ? current : CHANGELOG.slice(0, 1));
    setShowAll(false);
    setOpen(true);
  }, [requested]);

  const close = () => {
    useWhatsNew.getState().markSeen(APP_VERSION);
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-5 text-accent" />
          {t("whatsNewDialog.title")}
        </span>
      }
      className="max-w-xl"
      footer={
        <>
          {CHANGELOG.length > releases.length && (
            <Button variant="secondary" onClick={() => setShowAll(!showAll)}>
              {showAll ? t("whatsNewDialog.onlyNew") : t("whatsNewDialog.allVersions")}
            </Button>
          )}
          <Button onClick={close} autoFocus>
            {t("whatsNewDialog.gotIt")}
          </Button>
        </>
      }
    >
      <p className="mb-5 text-sm text-muted">
        {releases.length > 1
          ? t("whatsNewDialog.leadMany", { version: APP_VERSION, count: releases.length })
          : t("whatsNewDialog.lead", { version: APP_VERSION })}
      </p>
      <ReleaseList releases={showAll ? CHANGELOG : releases} />
    </Modal>
  );
}
