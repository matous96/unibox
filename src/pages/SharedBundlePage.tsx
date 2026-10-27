import { Download, Link2, PackagePlus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { PackageRow } from "@/components/package/PackageRow";
import { Button } from "@/components/ui/Button";
import { CardSkeletons, EmptyState } from "@/components/ui/States";
import {
  fallbackEntry,
  parseSourceKey,
  pickSource,
  sourceKey,
  useCatalog,
  useCatalogIndex,
  useInstalledIndex,
  useSourceIndex,
} from "@/hooks/usePackages";
import { decodeBundle } from "@/lib/bundleShare";
import { useBundle } from "@/store/bundle";
import { useBusyAppIds, useJobs } from "@/store/jobs";
import { useSourceScope } from "@/store/sourceLock";
import { useToasts } from "@/store/toasts";
import type { BundleFile, BundleItem } from "@/store/bundle";
import type { CatalogEntry, SourceId } from "@/types";

/** Nejvýš tolik aplikací z jednoho odkazu unibox://import. */
const MAX_IMPORT_APPS = 100;

/**
 * Sada z odkazu unibox://import?apps=…: id z katalogu, „zdroj:balíček“ nebo
 * samotné id balíčku WinGetu. Zdroj se vybere podle Nastavení (priorita, zapnuté).
 */
function bundleFromApps(
  apps: string,
  name: string,
  catalog: Map<string, CatalogEntry>,
  sources: Map<string, CatalogEntry>,
  enabled: SourceId[],
  preferred: SourceId,
): { bundle: BundleFile; missing: number } {
  const ids = [...new Set(apps.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, MAX_IMPORT_APPS);
  const packages: BundleItem[] = [];
  let missing = 0;
  for (const id of ids) {
    const key = parseSourceKey(id);
    const entry = catalog.get(id) ?? (key ? sources.get(sourceKey(key.source, key.packageId)) : sources.get(sourceKey("winget", id)));
    const source = entry && (key ? entry.sources.find((s) => s.source === key.source) : pickSource(entry, enabled, preferred));
    if (entry && source) packages.push({ source: source.source, packageId: source.packageId, appId: entry.id, name: entry.name });
    // Balíček mimo katalog se zdrojem („scoop:extras/neco“) jde nainstalovat i tak
    else if (key) packages.push({ source: key.source, packageId: key.packageId, appId: id, name: key.packageId });
    else missing++;
  }
  return { bundle: { format: "unibox-bundle", version: 1, name, createdAt: "", packages }, missing };
}

/**
 * Sdílená sada balíčků: seznam aplikací s možností nainstalovat vše, nebo si
 * sadu uložit a upravit. Zdroje odkazu:
 *  - …/bundles/shared?d=… (sada zakódovaná v odkazu, unibox://bundle?d=…),
 *  - …/bundles/shared?apps=…&name=… (seznam aplikací, unibox://import?apps=…).
 */
export function SharedBundlePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const catalogIndex = useCatalogIndex();
  const sourceIndex = useSourceIndex();
  const installedIndex = useInstalledIndex();
  const busy = useBusyAppIds();
  const enqueue = useJobs((s) => s.enqueue);
  const loadBundle = useBundle((s) => s.load);
  const toast = useToasts((s) => s.push);
  const { enabled, preferred } = useSourceScope();
  const { isLoading: catalogLoading } = useCatalog();

  const { bundle, missing } = useMemo<{ bundle: BundleFile | null; missing: number }>(() => {
    const apps = params.get("apps");
    if (apps) return bundleFromApps(apps, params.get("name") ?? "", catalogIndex, sourceIndex, enabled, preferred);
    try {
      return { bundle: decodeBundle(params.get("d") ?? ""), missing: 0 };
    } catch {
      return { bundle: null, missing: 0 };
    }
  }, [params, catalogIndex, sourceIndex, enabled, preferred]);

  // Seznam aplikací z odkazu se páruje s katalogem – počkat, než se načte
  if (catalogLoading && params.get("apps")) return <CardSkeletons count={4} />;
  if (!bundle || bundle.packages.length === 0) return <EmptyState icon={Link2} message={t("sharedBundle.invalid")} />;

  const entries = bundle.packages.map(
    (p) => catalogIndex.get(p.appId) ?? fallbackEntry(p.source, p.packageId, p.name, p.version ?? ""),
  );
  const pending = bundle.packages.filter((p) => !installedIndex.has(p.appId) && !busy.has(p.appId));

  const installAll = () => {
    for (const p of pending) {
      enqueue({ appId: p.appId, appName: p.name, source: p.source, packageId: p.packageId, kind: "install", version: p.version });
    }
    toast("success", t("bundles.queued", { count: pending.length }));
  };

  const saveAsMine = () => {
    loadBundle(bundle);
    toast("success", t("bundles.opened", { count: bundle.packages.length }));
    navigate("/bundles");
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-5">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <Link2 className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">{t("sharedBundle.eyebrow")}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">{bundle.name || t("sharedBundle.untitled")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("sharedBundle.subtitle", { count: bundle.packages.length })}</p>
          {missing > 0 && <p className="mt-1 text-xs text-muted">{t("sharedBundle.missing", { count: missing })}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={saveAsMine}>
            <PackagePlus className="size-4" />
            {t("sharedBundle.save")}
          </Button>
          <Button onClick={installAll} disabled={pending.length === 0}>
            <Download className="size-4" />
            {pending.length ? t("home.installAll", { count: pending.length }) : t("home.allInstalled")}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-1">
        {entries.map((e) => (
          <PackageRow key={e.id} entry={e} />
        ))}
      </div>
    </>
  );
}
