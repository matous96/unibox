import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CHANGELOG, type Release } from "@/data/changelog";
import { localize } from "@/data/editorial";
import { useSettings } from "@/store/settings";

/**
 * Vydání s novinkami (data/changelog.ts) – poznámky k vydání v nabídce ⋯
 * i dialog „Co je nového“ po aktualizaci.
 */
export function ReleaseList({ releases }: { releases: Release[] }) {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);

  return (
    <div className="flex flex-col gap-6">
      {releases.map((release) => (
        <section key={release.version}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="font-display text-lg font-bold">{t("menu.versionShort", { version: release.version })}</h3>
            {release.version === CHANGELOG[0]?.version && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">
                <Sparkles className="size-3" />
                {t("menu.latest")}
              </span>
            )}
            <span className="ml-auto text-xs text-muted">
              {new Date(release.date).toLocaleDateString(language, { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {release.highlights.map((h) => (
              <li key={h.cs} className="flex gap-2.5 text-sm leading-6">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                {localize(h, language)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
