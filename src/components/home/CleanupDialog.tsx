import { useQuery } from "@tanstack/react-query";
import { Check, Info, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SourceIcon } from "@/components/package/SourceIcon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/States";
import { cn, formatSizeText } from "@/lib/utils";
import { cacheCleanCommand, getSource, managers } from "@/services/managers";
import { useSettings } from "@/store/settings";
import { useToasts } from "@/store/toasts";
import type { SourceId } from "@/types";

/**
 * Vyčistit systém: najde mezipaměti správců balíčků (stažené instalátory
 * wingetu, archivy Chocolatey a Scoopu, mezipaměť npm, pip, NuGetu…)
 * a smaže vybrané. Nainstalované aplikace zůstanou nedotčené.
 */
export function CleanupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const enabled = useSettings((s) => s.enabledSources);
  const toast = useToasts((s) => s.push);
  const [selected, setSelected] = useState<SourceId[]>([]);
  const [cleaning, setCleaning] = useState<SourceId | null>(null);

  // Velikosti mezipamětí všech zapnutých správců (načtou se při otevření)
  const { data: caches, isFetching, refetch } = useQuery({
    queryKey: ["caches", enabled],
    queryFn: async () => {
      const results = await Promise.all(enabled.map(async (id) => ({ id, cache: await managers[id].getCache().catch(() => null) })));
      return results.filter((r) => r.cache && r.cache.size > 0).map((r) => ({ id: r.id, size: r.cache!.size }));
    },
    enabled: open,
    staleTime: 0,
  });

  // Po načtení vybrat vše
  useEffect(() => {
    if (caches) setSelected(caches.map((c) => c.id));
  }, [caches]);

  const total = (caches ?? []).filter((c) => selected.includes(c.id)).reduce((sum, c) => sum + c.size, 0);
  const toggle = (id: SourceId) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const clean = async () => {
    for (const id of selected) {
      setCleaning(id);
      await managers[id].clearCache().catch(() => toast("error", t("cleanup.failed", { source: getSource(id).label })));
    }
    setCleaning(null);
    toast("success", t("cleanup.done", { size: formatSizeText(total, language) }));
    await refetch();
  };

  const busy = cleaning !== null;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("cleanup.title")}
      className="max-w-xl"
      footer={
        caches && caches.length > 0 ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t("package.cancel")}
            </Button>
            <Button onClick={() => void clean()} disabled={busy || selected.length === 0}>
              {busy ? <Spinner className="size-4 text-accent-fg" /> : <Sparkles className="size-4" />}
              {t("cleanup.clean", { size: formatSizeText(total, language) })}
            </Button>
          </>
        ) : undefined
      }
    >
      <p className="-mt-1 mb-4 flex gap-2 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        {t("cleanup.intro")}
      </p>

      {isFetching && !caches ? (
        <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted">
          <Spinner />
          {t("cleanup.scanning")}
        </div>
      ) : !caches || caches.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm font-medium text-success">
          <Check className="size-5" />
          {t("cleanup.nothing")}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line">
          {caches.map((c) => {
            const meta = getSource(c.id);
            const checked = selected.includes(c.id);
            return (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60", busy && "cursor-default")}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggle(c.id)}
                    className="size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg/80">
                    <SourceIcon source={c.id} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t("cleanup.cacheOf", { source: meta.label })}</span>
                    <span className="block truncate font-mono text-[11px] text-muted">{cacheCleanCommand(c.id)}</span>
                  </span>
                  {cleaning === c.id ? (
                    <Spinner className="size-4" />
                  ) : (
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatSizeText(c.size, language)}</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
