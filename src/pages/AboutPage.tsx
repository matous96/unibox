import { ExternalLink, Globe2, Heart, Layers, Lock, Mail, MessagesSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import pkgJson from "../../package.json";
import { SourceIcon } from "@/components/package/SourceIcon";
import { GitHubIcon } from "@/components/ui/BrandIcons";
import { UniboxLogo } from "@/components/ui/Logo";
import { CONTACT_EMAIL, FORUM_URL, GITHUB_URL } from "@/config";
import { useInstallableStats } from "@/hooks/usePackages";
import { cn, formatAppCount } from "@/lib/utils";
import { SOURCES } from "@/services/managers";
import { useSettings } from "@/store/settings";

/** Technologie, na kterých Unibox stojí (s odkazy). */
const TECH = [
  { name: "Tauri", url: "https://tauri.app" },
  { name: "React", url: "https://react.dev" },
  { name: "TypeScript", url: "https://www.typescriptlang.org" },
  { name: "Tailwind CSS", url: "https://tailwindcss.com" },
  { name: "Microsoft.WinGet.Client", url: "https://www.powershellgallery.com/packages/Microsoft.WinGet.Client" },
  { name: "Lucide", url: "https://lucide.dev" },
  { name: "Simple Icons", url: "https://simpleicons.org" },
];

/** Stránka O Uniboxu: co to je, zdroje, technologie, komunita a upozornění. */
export function AboutPage() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const { total } = useInstallableStats();

  const highlights = [
    { Icon: Layers, title: t("about.hlSources", { count: SOURCES.length }), text: t("about.hlSourcesText") },
    { Icon: Heart, title: t("about.hlOpen"), text: t("about.hlOpenText") },
    { Icon: Lock, title: t("about.hlSafe"), text: t("about.hlSafeText") },
    { Icon: Globe2, title: t("about.hlLang"), text: t("about.hlLangText") },
  ];

  const community = [
    { label: "GitHub", href: GITHUB_URL, Icon: GitHubIcon },
    { label: t("nav.forum"), href: FORUM_URL, Icon: MessagesSquare },
    { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}`, Icon: Mail },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      {/* Úvod */}
      <section className="relative mb-10 overflow-hidden rounded-3xl border border-line bg-surface px-10 py-12 text-center shadow-card">
        <div aria-hidden className="absolute -top-28 left-1/2 size-96 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-col items-center">
          <UniboxLogo size={104} className="rounded-[25px] shadow-2xl shadow-accent/30" title="Unibox" />
          <h1 className="mt-5 font-display text-5xl font-bold tracking-tight">Unibox</h1>
          <p className="mt-1 text-sm text-muted tabular-nums">{t("about.version", { version: pkgJson.version })}</p>
          <p className="mt-4 max-w-xl text-lg">{t("about.tagline")}</p>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            {t("about.intro", { count: formatAppCount(total, language) })}
          </p>
        </div>
      </section>

      {/* Hlavní body */}
      <div className="mb-10 grid gap-4 sm:grid-cols-2">
        {highlights.map(({ Icon, title, text }) => (
          <div key={title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <Icon className="size-5" />
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-0.5 text-sm text-muted">{text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Zdroje balíčků */}
      <Block title={t("about.sourcesTitle")}>
        {(["apps", "dev"] as const).map((group) => (
          <div key={group} className="mb-5 last:mb-0">
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">{t(`sources.group.${group}`)}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SOURCES.filter((s) => s.group === group).map((s) => (
                <a
                  key={s.id}
                  href={s.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition-colors hover:bg-surface-2"
                >
                  <SourceIcon source={s.id} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      {s.label}
                      <span className={cn("size-2 rounded-full", s.dot)} />
                    </span>
                    <span className="block truncate text-xs text-muted">{t(`sources.desc.${s.id}`)}</span>
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </Block>

      {/* Technologie a poděkování */}
      <Block title={t("about.techTitle")} subtitle={t("about.techText")}>
        <div className="flex flex-wrap gap-2">
          {TECH.map((tech) => (
            <a
              key={tech.name}
              href={tech.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line bg-surface px-3 py-1 text-sm transition-colors hover:bg-surface-2"
            >
              {tech.name}
            </a>
          ))}
        </div>
      </Block>

      {/* Komunita */}
      <Block title={t("about.communityTitle")} subtitle={t("about.communityText")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {community.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("mailto:") ? undefined : "_blank"}
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition-colors hover:bg-surface-2"
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate font-medium">{label}</span>
            </a>
          ))}
        </div>
      </Block>

      {/* Upozornění k ochranným známkám */}
      <p className="mb-10 rounded-2xl bg-surface-2/60 px-5 py-4 text-xs leading-5 text-muted">{t("about.disclaimer")}</p>
    </div>
  );
}

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
