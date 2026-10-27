/**
 * Výzva k instalaci chybějícího správce balíčků: instalace z Chocolatey nebo
 * Scoopu, které v počítači nejsou. Jedním kliknutím je nainstaluje oficiálním
 * skriptem (Chocolatey s právy správce, Scoop bez nich) a fronta pak pokračuje.
 * Stav a odpověď: store/managerSetup.ts.
 */
import { useMutation } from "@tanstack/react-query";
import { Download, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/States";
import { getSource, managers } from "@/services/managers";
import { useManagerSetup } from "@/store/managerSetup";
import { SourceIcon } from "./SourceIcon";

export function ManagerSetupDialog() {
  const { t } = useTranslation();
  const { source, finish } = useManagerSetup();
  const setup = useMutation({
    mutationFn: () => managers[source!].setup(),
    onSuccess: () => finish(true),
  });
  const label = source ? getSource(source).label : "";

  return (
    <Modal
      open={!!source}
      onClose={() => !setup.isPending && finish(false)}
      title={t("managerSetup.title", { name: label })}
      footer={
        <>
          <Button variant="secondary" disabled={setup.isPending} onClick={() => finish(false)}>
            {t("package.cancel")}
          </Button>
          <Button disabled={setup.isPending} onClick={() => setup.mutate()}>
            {setup.isPending ? <Spinner className="size-4 text-accent-fg" /> : <Download className="size-4" />}
            {t("managerSetup.install", { name: label })}
          </Button>
        </>
      }
    >
      {source && (
        <div className="flex gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2">
            <SourceIcon source={source} />
          </span>
          <div className="text-sm">
            <p>{t("managerSetup.text", { name: label })}</p>
            <p className="mt-2 text-muted">{t(`managerSetup.how_${source}`, { defaultValue: t("managerSetup.how") })}</p>
            {setup.isPending && <p className="mt-3 text-muted">{t("managerSetup.installing", { name: label })}</p>}
            {setup.isError && (
              <p className="mt-3 flex gap-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
                <TriangleAlert className="size-4 shrink-0" />
                {String(setup.error instanceof Error ? setup.error.message : setup.error)}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
