/**
 * Přehled správce pro vývojáře (levý panel → npm, pip, Cargo…). Katalog
 * aplikací jeho balíčky neobsahuje, proto se při zamčení na něj místo
 * domovské stránky a přehledů katalogu ukáže tohle: stav správce v systému,
 * hledání v jeho registru (oblíbené balíčky jedním klikem) a balíčky,
 * které jsou přes něj nainstalované.
 */
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PackageCollection } from "@/components/package/PackageCollection";
import { SourceIcon } from "@/components/package/SourceIcon";
import { Button } from "@/components/ui/Button";
import { CollectionToolbar } from "@/components/ui/CollectionToolbar";
import { CardSkeletons, ErrorState, PageHeader, Spinner } from "@/components/ui/States";
import { useInstalledItems, useUpdates } from "@/hooks/useInstalledItems";
import { useManagerStatus } from "@/hooks/useManagerStatus";
import { useInstallableStats, useSortedPackages } from "@/hooks/usePackages";
import { cn, formatCompactCount } from "@/lib/utils";
import { getSource } from "@/services/managers";
import { useSettings } from "@/store/settings";
import type { SourceId } from "@/types";

/** Známé nástroje a knihovny – rychlé hledání bez psaní. */
const POPULAR: Partial<Record<SourceId, string[]>> = {
  npm: ["typescript", "pnpm", "yarn", "prettier", "eslint", "nodemon", "npm-check-updates", "http-server"],
  bun: ["typescript", "prettier", "@biomejs/biome", "vercel", "serve", "tsx"],
  pip: ["ruff", "black", "httpie", "poetry", "yt-dlp", "jupyterlab", "mypy", "pipx"],
  cargo: ["ripgrep", "bat", "fd-find", "eza", "tokei", "hyperfine", "cargo-edit", "zoxide"],
  vcpkg: ["fmt", "boost", "nlohmann-json", "sdl2", "curl", "zlib", "sqlite3", "openssl"],
  dotnet: ["dotnet-ef", "dotnet-outdated-tool", "csharpier", "dotnet-counters", "dotnet-trace", "dotnet-reportgenerator-globaltool"],
  pwsh: ["PSReadLine", "Pester", "posh-git", "Terminal-Icons", "PSScriptAnalyzer", "ImportExcel"],
  powershell: ["PSReadLine", "Pester", "posh-git", "Terminal-Icons", "PSScriptAnalyzer", "ImportExcel"],
};

export function DevSourceOverview({ source }: { source: SourceId }) {
  const { t } = useTranslation();
  const meta = getSource(source);
  const language = useSettings((s) => s.language);
  const registrySize = useInstallableStats().bySource[source];
  const { status, setup, canSetup } = useManagerStatus(source);
  const { items, isLoading, isError, isFetching, refetch } = useInstalledItems();
  const { updatable, pending, updateAll } = useUpdates(source);

  const entries = useMemo(() => items.filter((i) => i.pkg.source === source).map((i) => i.entry), [items, source]);
  const sorted = useSortedPackages(entries);
  const missing = status.data && !status.data.available;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-fg/80">
              <SourceIcon source={source} />
              <span className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-app", meta.dot)} />
            </span>
            {meta.label}
          </span>
        }
        subtitle={t(`sources.desc.${source}`)}
      />

      {/* Stav správce: verze, nebo „chybí“ s instalací přes WinGet (vcpkg jen návod) */}
      <div
        className={cn(
          "mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-5 py-3.5 text-sm",
          missing ? "border-danger/30 bg-danger/5" : "border-line bg-surface",
        )}
      >
        {status.isLoading ? (
          <Spinner className="size-4" />
        ) : missing ? (
          <>
            <AlertTriangle className="size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t("devSource.missing", { source: meta.label })}</p>
              <p className="text-xs text-muted">{canSetup ? t("devSource.missingText") : t(`managerSetup.how_${source}`)}</p>
              {setup.isError && (
                <p className="mt-0.5 text-xs text-danger">{setup.error instanceof Error ? setup.error.message : String(setup.error)}</p>
              )}
            </div>
            {canSetup && (
              <Button size="sm" disabled={setup.isPending} onClick={() => setup.mutate()}>
                {setup.isPending && <Spinner className="size-3.5 text-accent-fg" />}
                {t("settings.installManager", { name: meta.label })}
              </Button>
            )}
          </>
        ) : (
          <>
            <CheckCircle2 className="size-4 shrink-0 text-success" />
            <span>{t("settings.managerInstalled", { version: status.data?.version })}</span>
            {registrySize !== undefined && registrySize > 0 && (
              <span className="text-muted">
                {t("devSource.registry", { count: registrySize, formatted: formatCompactCount(registrySize, language) })}
              </span>
            )}
            <Link to="/settings?section=managers" className="ml-auto text-xs font-medium text-accent hover:underline">
              {t("devSource.settings")}
            </Link>
          </>
        )}
      </div>

      {/* Hledání v registru: pole nahoře hledá jen u tohoto správce, oblíbené jedním klikem */}
      <section className="mb-10">
        <h2 className="mb-1.5 flex items-center gap-2 font-display text-lg font-bold">
          <Search className="size-4.5 text-accent" />
          {t("devSource.searchTitle")}
        </h2>
        <p className="mb-3 text-sm text-muted">{t("devSource.searchHint", { source: meta.label })}</p>
        <div className="flex flex-wrap gap-2">
          {(POPULAR[source] ?? []).map((name) => (
            <Link
              key={name}
              to={`/search?q=${encodeURIComponent(name)}`}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 font-mono text-[13px] transition-colors hover:border-accent/50 hover:text-accent"
            >
              {name}
            </Link>
          ))}
        </div>
      </section>

      {/* Nainstalované přes tohoto správce s hromadnou aktualizací */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold">
            {t("devSource.installed", { source: meta.label })}
            {!isLoading && <span className="ml-2 text-sm font-medium text-muted tabular-nums">{entries.length}</span>}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <CollectionToolbar />
            <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
              {t("installed.refresh")}
            </Button>
            {updatable.length > 0 && (
              <Button size="sm" onClick={updateAll} disabled={pending === 0}>
                {t("installed.updateAll")}
                <span className="rounded-full bg-white/25 px-1.5 text-[11px] leading-5">{updatable.length}</span>
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <CardSkeletons count={4} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : sorted.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-muted">
            {t("devSource.none", { source: meta.label })}
          </p>
        ) : (
          <PackageCollection packages={sorted} showUninstall />
        )}
      </section>
    </>
  );
}
