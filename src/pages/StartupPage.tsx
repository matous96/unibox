/**
 * Po spuštění: programy, které se spouštějí po přihlášení do Windows –
 * z registru (Run), složek Po spuštění a plánovače úloh. Zapnout / vypnout
 * jedním kliknutím (jako Správce úloh – položka zůstane v seznamu), trvale
 * odstranit (se zálohou) a vliv na rychlost startu podle měření Windows.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCopy,
  FolderOpen,
  FolderSymlink,
  Gauge,
  KeyRound,
  MoreHorizontal,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { queryClient, queryKeys } from "@/app/queryClient";
import { Switch } from "@/components/settings/SettingsUi";
import { Button, IconButton } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/CollectionToolbar";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui/States";
import { useDismiss } from "@/hooks/useDismiss";
import { fileIconSrc } from "@/lib/icons";
import { isTauri } from "@/lib/tauri";
import { cn, formatSizeText } from "@/lib/utils";
import {
  deleteStartupItem,
  measureStartupImpact,
  setStartupEnabled,
  startupItems,
  startupTitle,
  type StartupImpact,
  type StartupItem,
  type StartupList,
  type StartupSource,
} from "@/services/startup";
import { useSecurity } from "@/store/security";
import { useSettings } from "@/store/settings";
import { useToasts } from "@/store/toasts";

type Filter = "all" | "enabled" | "disabled";

const SOURCE_ICON: Record<StartupSource, LucideIcon> = { registry: KeyRound, folder: FolderSymlink, task: CalendarClock };
const IMPACT_ORDER: Record<StartupImpact, number> = { high: 0, medium: 1, low: 2 };

export function StartupPage() {
  const { t, i18n } = useTranslation();
  const toast = useToasts((s) => s.push);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<StartupItem | null>(null);
  const list = useQuery({ queryKey: queryKeys.startup, queryFn: startupItems, enabled: isTauri() });
  const elevate = () => !useSecurity.getState().elevationProhibited;

  const measure = useMutation({
    mutationFn: () => measureStartupImpact(elevate()),
    onSuccess: async (measured) => {
      if (!measured) return toast("error", t("startup.needsAdmin"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.startup });
      toast("success", t("startup.measured"));
    },
    onError: (error) => toast("error", String(error)),
  });

  const items = list.data?.items ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => filter === "all" || (filter === "enabled") === i.enabled)
      .filter((i) => !q || [startupTitle(i), i.name, i.publisher ?? "", i.command].some((s) => s.toLowerCase().includes(q)))
      // Zapnuté nahoře, v nich nejdřív ty s největším vlivem, pak podle názvu
      .sort(
        (a, b) =>
          Number(b.enabled) - Number(a.enabled) ||
          (a.impact ? IMPACT_ORDER[a.impact] : 3) - (b.impact ? IMPACT_ORDER[b.impact] : 3) ||
          startupTitle(a).localeCompare(startupTitle(b), i18n.language),
      );
  }, [items, filter, query, i18n.language]);

  if (!isTauri()) {
    return (
      <>
        <PageHeader title={t("startup.title")} subtitle={t("startup.subtitle")} />
        <EmptyState icon={Power} message={t("startup.desktopOnly")} />
      </>
    );
  }

  const enabledCount = items.filter((i) => i.enabled).length;
  const highCount = items.filter((i) => i.enabled && i.impact === "high").length;
  const measuredAt = list.data?.measuredAt;

  return (
    <>
      <PageHeader
        title={t("startup.title")}
        subtitle={t("startup.subtitle")}
        actions={
          <>
            <IconButton aria-label={t("startup.refresh")} title={t("startup.refresh")} onClick={() => void list.refetch()} disabled={list.isFetching}>
              <RefreshCw className={cn("size-4", list.isFetching && "animate-spin")} />
            </IconButton>
            <Button variant="secondary" onClick={() => measure.mutate()} disabled={measure.isPending} title={t("startup.measureHint")}>
              {measure.isPending ? <Spinner className="size-4" /> : <Gauge className="size-4" />}
              {t("startup.measure")}
            </Button>
          </>
        }
      />

      {/* Souhrn */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t("startup.statEnabled")} value={list.data ? `${enabledCount} / ${items.length}` : "–"} />
        <Stat
          label={t("startup.statHigh")}
          value={measuredAt ? String(highCount) : "–"}
          tone={highCount > 0 ? "danger" : undefined}
        />
        <Stat
          label={t("startup.statMeasured")}
          value={measuredAt ? new Date(measuredAt * 1000).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }) : t("startup.notMeasured")}
          small
        />
      </div>

      {/* Filtr a hledání */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("startup.filterAll") },
            { value: "enabled", label: t("startup.filterEnabled") },
            { value: "disabled", label: t("startup.filterDisabled") },
          ]}
        />
        <label className="relative ml-auto w-full max-w-72 sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("startup.search")}
            aria-label={t("startup.search")}
            className="h-9 w-full rounded-full border border-line bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-muted focus:border-accent/50 focus:ring-4 focus:ring-accent/15"
          />
        </label>
      </div>

      {list.data?.tasksError && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          {t("startup.tasksError")}
        </p>
      )}

      {list.isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState icon={Power} message={items.length ? t("startup.noMatch") : t("startup.empty")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="hidden items-center gap-4 border-b border-line px-4 py-2.5 text-xs font-semibold tracking-wider text-muted uppercase md:flex">
            <span className="flex-1">{t("startup.colApp")}</span>
            <span className="w-44">{t("startup.colSource")}</span>
            <span className="w-28">{t("startup.colImpact")}</span>
            <span className="w-24 text-right">{t("startup.colEnabled")}</span>
            <span className="w-8" />
          </div>
          {shown.map((item) => (
            <StartupRow key={item.id} item={item} onDelete={() => setToDelete(item)} />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">{t("startup.footnote")}</p>

      <DeleteDialog item={toDelete} onClose={() => setToDelete(null)} />
    </>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: "danger"; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 truncate font-display font-bold tabular-nums", small ? "text-base" : "text-2xl", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}

/** Změní stav položky v načteném seznamu hned (před odpovědí backendu). */
function patchItem(id: string, changes: Partial<StartupItem> | null) {
  queryClient.setQueryData<StartupList>(queryKeys.startup, (data) =>
    data && {
      ...data,
      items: changes ? data.items.map((i) => (i.id === id ? { ...i, ...changes } : i)) : data.items.filter((i) => i.id !== id),
    },
  );
}

function StartupRow({ item, onDelete }: { item: StartupItem; onDelete: () => void }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const SourceIcon = SOURCE_ICON[item.source];
  const title = startupTitle(item);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setStartupEnabled(item.id, enabled, !useSecurity.getState().elevationProhibited),
    onMutate: (enabled) => patchItem(item.id, { enabled }),
    onSuccess: (outcome, enabled) => {
      if (outcome.done) {
        toast("success", t(enabled ? "startup.enabledToast" : "startup.disabledToast", { name: title }));
        return;
      }
      patchItem(item.id, { enabled: !enabled });
      toast("error", t("startup.needsAdmin"));
    },
    onError: (error, enabled) => {
      patchItem(item.id, { enabled: !enabled });
      toast("error", t("startup.failed", { error: String(error) }));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.startup }),
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 md:flex-nowrap", !item.enabled && "bg-surface-2/40")}>
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
        <ProgramIcon item={item} />
        <div className="min-w-0">
          <p className={cn("flex items-center gap-2 truncate text-sm font-semibold", !item.enabled && "text-muted")}>
            <span className="truncate" title={title}>
              {title}
            </span>
            {item.missing && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-3" />
                {t("startup.missing")}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted" title={item.command}>
            {[item.publisher, item.name !== title ? item.name : null].filter(Boolean).join(" · ") || item.command}
          </p>
        </div>
      </div>

      <div className="flex w-44 shrink-0 items-center gap-1.5 text-xs text-muted" title={item.location}>
        <SourceIcon className="size-3.5 shrink-0" />
        <span className="truncate">{t(`startup.source.${item.source}`)}</span>
        {item.machine && (
          <span title={t("startup.allUsers")} className="shrink-0">
            <Users className="size-3.5" aria-label={t("startup.allUsers")} />
          </span>
        )}
        {item.admin && (
          <span title={t("startup.adminItem")} className="shrink-0">
            <ShieldAlert className="size-3.5 text-amber-500 dark:text-amber-400" aria-label={t("startup.adminItem")} />
          </span>
        )}
      </div>

      <div className="w-28 shrink-0">
        <ImpactBadge item={item} />
      </div>

      <div className="flex w-24 shrink-0 justify-end">
        <Switch
          checked={item.enabled}
          disabled={toggle.isPending}
          onChange={(enabled) => toggle.mutate(enabled)}
          label={t(item.enabled ? "startup.disable" : "startup.enable", { name: title })}
        />
      </div>

      <RowMenu item={item} onDelete={onDelete} />
    </div>
  );
}

/** Ikona programu přes protokol icon:// (jako v Průzkumníku), jinak ikona zdroje. */
function ProgramIcon({ item }: { item: StartupItem }) {
  const [failed, setFailed] = useState(false);
  const Fallback = SOURCE_ICON[item.source];
  if (!item.target || item.missing || failed) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
        <Fallback className="size-4.5" />
      </span>
    );
  }
  return (
    <img
      src={fileIconSrc(item.target)}
      alt=""
      onError={() => setFailed(true)}
      className={cn("size-9 shrink-0 object-contain", !item.enabled && "opacity-60 grayscale")}
    />
  );
}

function ImpactBadge({ item }: { item: StartupItem }) {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  if (!item.impact) {
    return <span className="text-xs text-muted">{t(item.enabled ? "startup.impact.none" : "startup.impact.disabled")}</span>;
  }
  const tone = {
    high: "bg-danger/12 text-danger",
    medium: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    low: "bg-success/12 text-success",
  }[item.impact];
  const detail = t("startup.impactDetail", { cpu: item.cpuMs ?? 0, disk: formatSizeText(item.diskBytes ?? 0, language) });
  return (
    <span title={detail} className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", tone)}>
      {t(`startup.impact.${item.impact}`)}
    </span>
  );
}

/** Nabídka „…“: umístění souboru, kopírování příkazu, odstranění. */
function RowMenu({ item, onDelete }: { item: StartupItem; onDelete: () => void }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const run = (fn: () => void | Promise<void>) => () => {
    setOpen(false);
    void fn();
  };

  return (
    <div ref={ref} className="relative w-8 shrink-0">
      <IconButton aria-label={t("startup.more")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal className="size-4" />
      </IconButton>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 flex w-60 flex-col rounded-xl border border-line bg-surface p-1 shadow-lg">
          <MenuItem
            icon={FolderOpen}
            label={t("startup.reveal")}
            disabled={!item.target || item.missing}
            onClick={run(async () => {
              try {
                if (item.target) await revealItemInDir(item.target);
              } catch {
                toast("error", t("common.error"));
              }
            })}
          />
          <MenuItem
            icon={ClipboardCopy}
            label={t("startup.copyCommand")}
            disabled={!item.command}
            onClick={run(async () => {
              await navigator.clipboard.writeText(item.command);
              toast("success", t("startup.copied"));
            })}
          />
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Trash2} label={t("startup.delete")} danger onClick={run(onDelete)} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, disabled, danger }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-40",
        danger ? "text-danger hover:bg-danger/10" : "hover:bg-surface-2",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

/** Potvrzení trvalého odstranění (se zálohou registru / úlohy, zástupce do Koše). */
function DeleteDialog({ item, onClose }: { item: StartupItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const remove = useMutation({
    mutationFn: (target: StartupItem) => deleteStartupItem(target.id, !useSecurity.getState().elevationProhibited),
    onSuccess: (outcome, target) => {
      onClose();
      if (!outcome.done) return toast("error", t("startup.needsAdmin"));
      patchItem(target.id, null);
      toast("success", t("startup.deleted", { name: startupTitle(target) }));
      if (outcome.backup) toast("info", t("startup.backupSaved", { folder: outcome.backup }));
    },
    onError: (error) => toast("error", t("startup.failed", { error: String(error) })),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.startup }),
  });

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={item ? t("startup.deleteTitle", { name: startupTitle(item) }) : ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            {t("package.cancel")}
          </Button>
          <Button variant="danger" onClick={() => item && remove.mutate(item)} disabled={remove.isPending}>
            {remove.isPending ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
            {t("startup.delete")}
          </Button>
        </>
      }
    >
      {item && (
        <>
          <p className="text-sm text-muted">{t(`startup.deleteText.${item.source}`)}</p>
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs break-all select-text">{item.command || item.location}</p>
          {item.enabled && <p className="mt-3 text-xs text-muted">{t("startup.deleteTip")}</p>}
        </>
      )}
    </Modal>
  );
}
