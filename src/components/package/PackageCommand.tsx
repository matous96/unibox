import { Check, ChevronDown, Copy, Terminal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Segmented } from "@/components/ui/CollectionToolbar";
import { cn } from "@/lib/utils";
import { getSource, sourceCommand } from "@/services/managers";
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
 * (winget / Scoop / Chocolatey) – instalace, aktualizace, odinstalace –
 * každý s vlastním tlačítkem Kopírovat. Doplňuje tlačítko Instalovat
 * pro ruční instalaci nebo skripty.
 */
export function PackageCommand({ sources, active, installed, name }: PackageCommandProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CommandKind>("install");

  const kinds: { value: CommandKind; label: string }[] = [
    { value: "install", label: t("package.cliInstall") },
    { value: "update", label: t("package.cliUpgrade") },
    { value: "uninstall", label: t("package.cliUninstall") },
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Jeden řádek: správce, příkaz se zvýrazněným id balíčku a tlačítko Kopírovat. */
function CommandRow({ pkg, kind, highlighted }: { pkg: PackageSource; kind: CommandKind; highlighted: boolean }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);
  const [copied, setCopied] = useState(false);
  const meta = getSource(pkg.source);
  const command = sourceCommand(pkg.source, kind, pkg.packageId);

  // Po 2 s vrátit tlačítko zpět na „Kopírovat“
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      toast("error", t("common.error"));
    }
  };

  // Zvýraznění id balíčku v textu příkazu (u Scoopu mimo instalaci jen název aplikace)
  const target = pkg.source === "scoop" && kind !== "install" ? pkg.packageId.split("/").pop()! : pkg.packageId;
  const index = command.lastIndexOf(target);
  const before = index >= 0 ? command.slice(0, index) : command;
  const after = index >= 0 ? command.slice(index + target.length) : "";

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
      <code className="min-w-0 flex-1 truncate font-mono text-[15px] select-text">
        <span className="text-fg">{before}</span>
        {index >= 0 && <span className="font-semibold text-accent">{target}</span>}
        <span className="text-fg">{after}</span>
      </code>
      <button
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
