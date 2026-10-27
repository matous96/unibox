/**
 * Nastavení → Oprávnění správce a další nebezpečná nastavení (po vzoru
 * UniGetUI). Vše je ve výchozím stavu vypnuté. Volby uplatňuje backend
 * (security.rs – UAC, vlastní argumenty, příkazy před / po instalaci, cesty
 * ke správcům) i frontend (dialog voleb instalace, import sad).
 */
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/States";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { getSource } from "@/services/managers";
import { useSecurity, type PathManager } from "@/store/security";
import { Card, SwitchRow } from "./SettingsUi";

export function SecuritySection() {
  const { t } = useTranslation();
  const s = useSecurity();

  return (
    <>
      {/* Výrazné upozornění na začátku sekce */}
      <div className="mb-6 flex gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 text-sm text-amber-700 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <p>
          <strong>{t("security.warningTitle")}</strong> {t("security.warning")}
        </p>
      </div>

      <Card title={t("security.elevationTitle")}>
        <SwitchRow
          label={t("security.elevateAlways")}
          hint={t("security.elevateAlwaysHint")}
          checked={s.elevateAlways}
          onChange={(elevateAlways) => s.set({ elevateAlways })}
          disabled={s.elevationProhibited}
        />
        <SwitchRow
          label={t("security.elevateOnce")}
          hint={t("security.elevateOnceHint")}
          checked={s.elevateOnce}
          onChange={(elevateOnce) => s.set({ elevateOnce })}
          disabled={s.elevationProhibited}
        />
        <SwitchRow
          label={t("security.elevationProhibited")}
          hint={t("security.elevationProhibitedHint")}
          checked={s.elevationProhibited}
          onChange={(elevationProhibited) => s.set({ elevationProhibited })}
        />
        <BrokerRow />
      </Card>

      <Card title={t("security.operationsTitle")}>
        <SwitchRow
          label={t("security.allowCustomArgs")}
          hint={t("security.allowCustomArgsHint")}
          checked={s.allowCustomArgs}
          onChange={(allowCustomArgs) => s.set({ allowCustomArgs })}
        />
        <SwitchRow
          label={t("security.allowPrePost")}
          hint={t("security.allowPrePostHint")}
          checked={s.allowPrePostCommands}
          onChange={(allowPrePostCommands) => s.set({ allowPrePostCommands })}
        />
      </Card>

      <Card title={t("security.managersTitle")}>
        <SwitchRow
          label={t("security.allowPaths")}
          hint={t("security.allowPathsHint")}
          checked={s.allowCustomManagerPaths}
          onChange={(allowCustomManagerPaths) => s.set({ allowCustomManagerPaths })}
        />
        {s.allowCustomManagerPaths && (["winget", "chocolatey", "scoop"] as const).map((m) => <ManagerPathRow key={m} manager={m} />)}
      </Card>

      <Card title={t("security.importTitle")}>
        <SwitchRow
          label={t("security.importCustomArgs")}
          hint={t("security.importCustomArgsHint")}
          checked={s.allowImportCustomArgs}
          onChange={(allowImportCustomArgs) => s.set({ allowImportCustomArgs })}
        />
        <SwitchRow
          label={t("security.importPrePost")}
          hint={t("security.importPrePostHint")}
          checked={s.allowImportPrePostCommands}
          onChange={(allowImportPrePostCommands) => s.set({ allowImportPrePostCommands })}
        />
      </Card>
    </>
  );
}

/**
 * Delegování na broker Devolutions Agent: Unibox umí zjistit, jestli agent
 * v počítači je, ale operace mu zatím předat neumí – přepínač je proto vypnutý
 * a „Inspect active package broker policy“ ukáže skutečný stav.
 */
function BrokerRow() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["devolutions-agent"],
    queryFn: () => invoke<{ installed: boolean; running: boolean; service: string | null }>("devolutions_agent_status"),
    enabled: open && isTauri(),
  });

  return (
    <div>
      <SwitchRow label={t("security.broker")} hint={t("security.brokerHint")} checked={false} onChange={() => undefined} disabled />
      <div className="px-4 pb-3.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          Inspect active package broker policy
        </button>
        {open && (
          <div className="mt-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-mono text-xs leading-5">
            {isLoading ? (
              <Spinner className="size-3.5" />
            ) : !isTauri() ? (
              t("security.brokerWeb")
            ) : (
              <>
                <p>
                  {t("security.brokerAgent")}:{" "}
                  {data?.installed ? `${data.service} (${data.running ? t("security.brokerRunning") : t("security.brokerStopped")})` : t("security.brokerMissing")}
                </p>
                <p>{t("security.brokerPolicy")}: {t("security.brokerDirect")}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Vlastní cesta ke spustitelnému souboru správce (ověří ji backend). */
function ManagerPathRow({ manager }: { manager: PathManager }) {
  const { t } = useTranslation();
  const value = useSecurity((s) => s.managerPaths[manager] ?? "");
  const set = useSecurity((s) => s.set);
  const paths = useSecurity((s) => s.managerPaths);
  const [error, setError] = useState<string | null>(null);
  const placeholder = { winget: "C:\\…\\winget.exe", chocolatey: "C:\\ProgramData\\chocolatey\\choco.exe", scoop: "C:\\Users\\…\\scoop\\shims\\scoop.ps1" }[manager];

  const validate = async (path: string) => {
    if (!path.trim() || !isTauri()) return setError(null);
    try {
      await invoke("check_manager_path", { manager, path });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="px-4 py-3">
      <p className="mb-1.5 text-sm font-medium">{getSource(manager).label}</p>
      <input
        value={value}
        onChange={(e) => set({ managerPaths: { ...paths, [manager]: e.target.value || undefined } })}
        onBlur={(e) => void validate(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          "h-9 w-full rounded-lg border bg-surface-2 px-3 font-mono text-sm outline-none placeholder:text-muted/60 focus:border-accent/50",
          error ? "border-danger/60" : "border-line",
        )}
      />
      <p className={cn("mt-1 text-xs", error ? "text-danger" : "text-muted")}>{error ?? t("security.pathHint")}</p>
    </div>
  );
}
