import { Check, ChevronDown, ChevronRight, Copy, Terminal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Segmented } from "@/components/ui/CollectionToolbar";
import { cn } from "@/lib/utils";
import { getSource, sourceCommand } from "@/services/managers";
import { appCommand, type AppCommandKind } from "@/services/managers/commandGuide";
import { useToasts } from "@/store/toasts";
import type { CommandKind, InstalledPackage, PackageSource, SourceId } from "@/types";

interface PackageCommandProps {
  /** Všechny zdroje aplikace – pro každý se zobrazí vlastní příkaz. */
  sources: PackageSource[];
  /** Zvolený / nainstalovaný zdroj – jeho řádek je zvýrazněný. */
  active?: SourceId;
  /**
   * Nainstalovaný balíček – aktualizace a odinstalace jeho správce míří na něj
   * (může mít jiné id než katalog: „Google.Chrome.EXE“, „ARP\…\Discord“).
   */
  installed?: Pick<InstalledPackage, "source" | "packageId">;
  name: string;
}

/**
 * Příkazy pro příkazový řádek všech správců, ve kterých je aplikace dostupná
 * (winget / Scoop / Chocolatey…) – instalace, aktualizace, odinstalace, informace,
 * verze a zamknutí verze – každý s vlastním tlačítkem Kopírovat. Doplňuje tlačítko
 * Instalovat pro ruční instalaci nebo skripty; další příkazy jsou na stránce
 * Příkazy pro terminál.
 */
type Kind = CommandKind | AppCommandKind;
const APP_KINDS: readonly string[] = ["info", "versions", "pin"];

export function PackageCommand({ sources, active, installed, name }: PackageCommandProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("install");

  const kinds: { value: Kind; label: string }[] = [
    { value: "install", label: t("package.cliInstall") },
    { value: "update", label: t("package.cliUpgrade") },
    { value: "uninstall", label: t("package.cliUninstall") },
    { value: "info", label: t("package.cliInfo") },
    { value: "versions", label: t("package.cliVersions") },
    { value: "pin", label: t("package.cliPin") },
  ];

  return (
    <section className="border-b border-line py-4">
      {/* Záhlaví – kliknutím se příkazy rozbalí / sbalí */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="group flex cursor-pointer items-center gap-2 rounded-lg py-1 text-[15px] font-semibold text-muted transition-colors hover:text-fg"
        >
          <Terminal className="size-4" />
          {t("package.cliTitle", { name })}
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
        {open && <Segmented value={kind} onChange={setKind} options={kinds} />}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {/* Pevné pořadí správců; zvolený zdroj je jen zvýrazněný */}
            <div className="flex flex-col gap-2 pt-3 pb-2">
              {sources.map((pkg) => (
                <CommandRow
                  key={pkg.source}
                  pkg={kind !== "install" && installed?.source === pkg.source ? { ...pkg, packageId: installed.packageId } : pkg}
                  kind={kind}
                  highlighted={pkg.source === active}
                />
              ))}
              <Link
                to={`/commands?source=${active ?? sources[0]?.source ?? "winget"}`}
                className="mt-1 inline-flex items-center gap-1 self-start text-sm font-medium text-accent hover:underline"
              >
                {t("package.cliMore")}
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Jeden řádek: správce, příkaz se zvýrazněným id balíčku a tlačítko Kopírovat. */
function CommandRow({ pkg, kind, highlighted }: { pkg: PackageSource; kind: Kind; highlighted: boolean }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const [copied, setCopied] = useState(false);
  const meta = getSource(pkg.source);
  // null = správce to neumí (např. zamknutí verze u npm)
  const command = APP_KINDS.includes(kind) ? appCommand(pkg.source, kind as AppCommandKind, pkg.packageId) : sourceCommand(pkg.source, kind as CommandKind, pkg.packageId);

  // Po 2 s vrátit tlačítko zpět na „Kopírovat“
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      toast("error", t("common.error"));
    }
  };

  // Zvýraznění id balíčku v textu příkazu (u Scoopu mimo instalaci jen název aplikace)
  const target = pkg.source === "scoop" && kind !== "install" ? pkg.packageId.split("/").pop()! : pkg.packageId;
  const text = command ?? "";
  const index = text.lastIndexOf(target);
  const before = index >= 0 ? text.slice(0, index) : text;
  const after = index >= 0 ? text.slice(index + target.length) : "";

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl py-2.5 pr-2.5 pl-5 ring-1",
        highlighted ? "bg-accent/10 ring-accent/20" : "bg-surface-2/60 ring-line",
      )}
    >
      <span className="flex w-28 shrink-0 items-center gap-2 text-sm font-medium text-muted">
        <span className={cn("size-2 rounded-full", meta.dot)} />
        {meta.label}
      </span>
      {command ? (
        <code className="min-w-0 flex-1 truncate font-mono text-[15px] select-text">
          <span className="text-fg">{before}</span>
          {index >= 0 && <span className="font-semibold text-accent">{target}</span>}
          <span className="text-fg">{after}</span>
        </code>
      ) : (
        <span className="min-w-0 flex-1 py-2 text-sm text-muted">{t("package.cliUnsupported", { manager: meta.label })}</span>
      )}
      <button
        hidden={!command}
        type="button"
        onClick={copy}
        aria-label={`${t("package.copyCommand")} (${meta.label})`}
        title={`${t("package.copyCommand")} (${meta.label})`}
        className={cn(
          "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
          copied ? "bg-success/15 text-success" : "bg-surface text-fg hover:bg-surface-3",
        )}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t("package.copiedShort") : t("package.copy")}
      </button>
    </div>
  );
}
