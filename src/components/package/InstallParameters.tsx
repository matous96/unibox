import {
  AppWindow,
  Check,
  ChevronDown,
  EyeOff,
  Monitor,
  MousePointerClick,
  PowerOff,
  ShieldUser,
  SlidersHorizontal,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Segmented } from "@/components/ui/CollectionToolbar";
import { enabledFeatures, installerFeatures, supportsNoRestart } from "@/lib/installArgs";
import { cn } from "@/lib/utils";
import { getSource } from "@/services/managers";
import { useInstallOptions, type SavedInstallOptions } from "@/store/installOptions";
import type { CatalogEntry, InstallerFeatureId, InstallOptions, InstallScope, PackageSource } from "@/types";

const FEATURE_ICONS: Record<InstallerFeatureId, LucideIcon> = {
  addToPath: Terminal,
  startMenu: AppWindow,
  desktopShortcut: Monitor,
  contextMenu: MousePointerClick,
};

/** Má aplikace u daného zdroje nějaké podrobné parametry instalace? */
export const hasInstallParameters = (entry: CatalogEntry, pkg: PackageSource | undefined) =>
  installerFeatures(entry, pkg).length > 0 || supportsNoRestart(pkg);

/**
 * Podrobné parametry instalace jako přepínací štítky: Přidat do PATH,
 * zástupce v nabídce Start / na ploše, kontextová nabídka a bez restartu
 * (potlačení restartu po instalaci). Nabízí jen to, co instalátor zvoleného
 * zdroje umí.
 */
export function InstallParameters({
  entry,
  pkg,
  options,
  onChange,
}: {
  entry: CatalogEntry;
  pkg: PackageSource | undefined;
  options: InstallOptions | undefined;
  onChange: (patch: Pick<InstallOptions, "features" | "noRestart">) => void;
}) {
  const { t } = useTranslation();
  const features = installerFeatures(entry, pkg);
  const enabled = enabledFeatures(entry, options);

  const toggleFeature = (id: InstallerFeatureId) =>
    onChange({ features: enabled.includes(id) ? enabled.filter((f) => f !== id) : [...enabled, id] });

  return (
    <div className="flex flex-wrap gap-1.5">
      {features.map((f) => (
        <Chip
          key={f.id}
          icon={FEATURE_ICONS[f.id]}
          label={t(`installParams.${f.id}`)}
          active={enabled.includes(f.id)}
          onClick={() => toggleFeature(f.id)}
        />
      ))}
      {supportsNoRestart(pkg) && (
        <Chip
          icon={PowerOff}
          label={t("installParams.noRestart")}
          active={options?.noRestart !== false}
          onClick={() => onChange({ noRestart: options?.noRestart === false })}
        />
      )}
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  active,
  onClick,
  title,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active ? "border-accent/40 bg-accent/12 text-accent" : "border-line bg-surface text-muted hover:text-fg",
      )}
    >
      {active ? <Check className="size-3.5" strokeWidth={2.5} /> : <Icon className="size-3.5" />}
      {label}
    </button>
  );
}

/**
 * Volby instalace pod tlačítkem Instalovat – schované pod odkazem „Volby
 * instalace“, rozbalí se kliknutím. Ukládají se k aplikaci (stejně jako
 * v dialogu Možnosti instalace) a použije je i tlačítko Instalovat:
 *  - tichá instalace (bez průvodce) a spuštění jako správce,
 *  - části instalátoru (PATH, zástupci…) a bez restartu,
 *  - rozsah: jen pro tohoto uživatele / pro všechny uživatele (jen rozsahy,
 *    které instalátor podle katalogu podporuje).
 * Nabízí jen volby, které zvolený správce umí. Změněné volby jsou vidět
 * i ve sbaleném stavu (souhrn vedle odkazu).
 */
export function InlineInstallParameters({ entry, pkg }: { entry: CatalogEntry; pkg: PackageSource | undefined }) {
  const { t } = useTranslation();
  const saved = useInstallOptions((s) => s.byApp[entry.id]);
  const save = useInstallOptions((s) => s.save);
  const [open, setOpen] = useState(false);
  if (!pkg) return null;

  const support = getSource(pkg.source).options;
  // Z aktuálního stavu úložiště, ne z posledního vykreslení – rychlé klikání po sobě se nepřepíše
  const update = (patch: Partial<SavedInstallOptions>) =>
    save(entry.id, { ...useInstallOptions.getState().byApp[entry.id], ...patch });
  // Rozsahy z manifestu (winget: Scope); neznámé = oba
  const scopes: InstallScope[] = support.scope ? (pkg.scopes?.length ? pkg.scopes : ["user", "machine"]) : [];
  const scopeLabel = (s: InstallScope) => t(s === "user" ? "installOptions.scopeUser" : "installOptions.scopeMachine");
  // Co se liší od výchozí instalace – ve sbaleném stavu jako souhrn
  const changed = [
    support.interactive && saved?.interactive && t("installParams.wizard"),
    saved?.asAdmin && t("installParams.asAdmin"),
    saved?.scope && scopes.includes(saved.scope) && scopeLabel(saved.scope),
  ].filter((s): s is string => !!s);

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="group inline-flex max-w-full cursor-pointer items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-fg"
      >
        <SlidersHorizontal className="size-3.5 shrink-0" />
        {t("installParams.toggle")}
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")} />
        {!open && changed.length > 0 && <span className="truncate text-accent">· {changed.join(" · ")}</span>}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">{t("installParams.before")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {/* Tichá instalace je výchozí – vypnutím se ukáže průvodce instalátoru */}
                  {support.interactive && (
                    <Chip
                      icon={EyeOff}
                      label={t("installParams.silent")}
                      title={t("installParams.silentHint")}
                      active={!saved?.interactive}
                      onClick={() => update({ interactive: !saved?.interactive })}
                    />
                  )}
                  <Chip
                    icon={ShieldUser}
                    label={t("installParams.asAdmin")}
                    title={t("installOptions.asAdminHint")}
                    active={!!saved?.asAdmin}
                    onClick={() => update({ asAdmin: !saved?.asAdmin })}
                  />
                  {hasInstallParameters(entry, pkg) && <InstallParameters entry={entry} pkg={pkg} options={saved} onChange={update} />}
                </div>
              </div>

              {scopes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{t("installOptions.scope")}:</span>
                  <Segmented<InstallScope | "">
                    value={saved?.scope ?? ""}
                    onChange={(scope) => update({ scope: scope || undefined })}
                    options={[{ value: "", label: t("installOptions.default") }, ...scopes.map((s) => ({ value: s, label: scopeLabel(s) }))]}
                  />
                  {/* Instalace pro všechny uživatele zapisuje do Program Files – bez práv správce si vyžádá UAC */}
                  {saved?.scope === "machine" && !saved.asAdmin && (
                    <span className="text-xs text-muted">{t("installParams.machineNeedsAdmin")}</span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
