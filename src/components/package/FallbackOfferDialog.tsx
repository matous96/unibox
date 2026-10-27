/**
 * Instalace z primárního zdroje selhala – nabídka instalace z jiného správce,
 * který aplikaci má (Chocolatey, Scoop…). Volba zařadí novou instalaci do
 * fronty; nenainstalovaného správce fronta nejdřív nabídne nainstalovat.
 * Stav: store/fallbackOffer.ts (plní ho fronta, store/jobs.ts).
 */
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { getSource } from "@/services/managers";
import { useFallbackOffer, type FallbackCandidate } from "@/store/fallbackOffer";
import { useJobs } from "@/store/jobs";
import { SourceIcon } from "./SourceIcon";

export function FallbackOfferDialog() {
  const { t } = useTranslation();
  const offer = useFallbackOffer((s) => s.offers[0]);
  const close = useFallbackOffer((s) => s.close);
  const enqueue = useJobs((s) => s.enqueue);

  const install = ({ source }: FallbackCandidate) => {
    if (!offer) return;
    enqueue({ appId: offer.appId, appName: offer.appName, source: source.source, packageId: source.packageId, kind: "install" });
    close();
  };

  return (
    <Modal
      open={!!offer}
      onClose={close}
      title={offer ? t("fallbackOffer.title", { name: offer.appName }) : ""}
      footer={
        <Button variant="secondary" onClick={close}>
          {t("fallbackOffer.close")}
        </Button>
      }
    >
      {offer && (
        <div className="text-sm">
          <p className="flex gap-2 rounded-xl bg-danger/10 px-3 py-2 text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{t("fallbackOffer.failed", { source: getSource(offer.failedSource).label, error: offer.error })}</span>
          </p>
          <p className="mt-4">{t("fallbackOffer.question", { name: offer.appName })}</p>
          <div className="mt-3 flex flex-col gap-2">
            {offer.candidates.map((candidate) => {
              const label = getSource(candidate.source.source).label;
              return (
                <button
                  key={candidate.source.source}
                  type="button"
                  onClick={() => install(candidate)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent/5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                    <SourceIcon source={candidate.source.source} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t("fallbackOffer.installFrom", { source: label })}</span>
                    <span className="block truncate text-xs text-muted">
                      {[
                        candidate.source.version && t("fallbackOffer.version", { version: candidate.source.version }),
                        !candidate.ready && t("fallbackOffer.needsSetup", { source: label }),
                      ]
                        .filter(Boolean)
                        .join(" · ") || candidate.source.packageId}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
