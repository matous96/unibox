/**
 * Výuka příkazů pro terminál pro všechny správce balíčků – co který příkaz dělá
 * a příklad, který jde rovnou zkopírovat (services/managers/commandGuide.ts).
 * Je na stránce Příkazy pro terminál (s ukázkovou aplikací, příkazy jdou rovnou spustit)
 * i v Nastavení (`placeholders` – místo názvu aplikace „<ID>“, „<balíček>“, „<název>“).
 * Správce je v adrese (?source=scoop) – ostatní parametry (?section=…) zůstanou.
 */
import { Info, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { CopyCommand } from "@/components/package/ManualInstallDialog";
import { cn } from "@/lib/utils";
import { GUIDE_GROUPS, guideCommand, type GuideCommandId } from "@/services/managers/commandGuide";
import { getSource, SOURCES } from "@/services/managers";
import type { SourceId } from "@/types";

export function CommandGuide({ placeholders = false }: { placeholders?: boolean }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get("source");
  const source: SourceId = SOURCES.some((s) => s.id === requested) ? (requested as SourceId) : "winget";
  const meta = getSource(source);
  const version = t("commands.versionPlaceholder");
  // WinGet hledá podle ID („Mozilla.Firefox“), ostatní správci podle názvu balíčku
  const example = placeholders
    ? { packageId: t(source === "winget" ? "commands.idPlaceholder" : "commands.packagePlaceholder"), query: t("commands.queryPlaceholder") }
    : undefined;

  const groups = GUIDE_GROUPS.map((group) => ({
    id: group.id,
    commands: group.commands
      .map((id) => ({ id, command: guideCommand(source, id, version, example) }))
      .filter((c): c is { id: GuideCommandId; command: string } => c.command !== null),
  })).filter((group) => group.commands.length > 0);

  const choose = (id: SourceId) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("source", id);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      {/* Správci: aplikace, pak pro vývojáře */}
      <nav className="mb-6 flex flex-col gap-3" aria-label={t("commands.managers")}>
        {(["apps", "dev"] as const).map((group) => (
          <div key={group} className="flex items-start gap-2">
            <span className="w-28 shrink-0 pt-2 text-xs font-semibold tracking-wide text-muted uppercase">{t(`sources.group.${group}`)}</span>
            {/* Zalomené čipy zůstanou zarovnané vedle popisku */}
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {SOURCES.filter((s) => s.group === group).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === source}
                  onClick={() => choose(s.id)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    s.id === source ? "border-accent/40 bg-accent/12 text-accent" : "border-line bg-surface hover:bg-surface-2",
                  )}
                >
                  <span className={cn("size-2 rounded-full", s.dot)} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Jak příkazy spouštět a co o správci vědět */}
      <div className="mb-8 flex gap-3 rounded-2xl border border-line bg-surface-2/60 px-5 py-4 text-sm leading-6">
        <Info className="mt-1 size-4 shrink-0 text-accent" />
        <div className="flex flex-col gap-1.5">
          <p>{t(placeholders ? "commands.howToPlaceholders" : "commands.howTo")}</p>
          <p className="text-muted">{t(`commands.note.${source}`)}</p>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.id} className="mb-8">
          <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-bold">
            <Terminal className="size-5 text-accent" />
            {t(`commands.group.${group.id}`)}
          </h3>
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
            {group.commands.map(({ id, command }) => (
              <div key={id}>
                <p className="text-sm font-semibold">{t(`commands.cmd.${id}.title`)}</p>
                <p className="mb-2 text-xs leading-5 text-muted">{t(`commands.cmd.${id}.text`, { manager: meta.label })}</p>
                <CopyCommand command={command} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
