import { BookOpen, Bug, Code, ExternalLink, Globe, LifeBuoy, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { GitHubIcon } from "@/components/ui/BrandIcons";
import type { CatalogEntry } from "@/types";

interface QuickLink {
  label: string;
  href: string;
  Icon: LucideIcon | ComponentType<{ className?: string }>;
}

/**
 * Rychlé odkazy vývojáře aplikace: web, zdrojový kód (GitHub…), hlášení chyb,
 * dokumentace a podpora. Odkazy, které aplikace nemá, se nezobrazí.
 */
export function QuickLinks({ entry }: { entry: CatalogEntry }) {
  const { t } = useTranslation();
  const isGitHub = entry.repositoryUrl?.startsWith("https://github.com/");

  const links: QuickLink[] = [];
  if (entry.homepage) links.push({ label: t("links.website"), href: entry.homepage, Icon: Globe });
  if (entry.repositoryUrl) {
    links.push({ label: isGitHub ? "GitHub" : t("links.source"), href: entry.repositoryUrl, Icon: isGitHub ? GitHubIcon : Code });
  }
  if (entry.issuesUrl) links.push({ label: t("links.issues"), href: entry.issuesUrl, Icon: Bug });
  if (entry.docsUrl) links.push({ label: t("links.docs"), href: entry.docsUrl, Icon: BookOpen });
  // Podpora jen tehdy, když vede jinam než na web aplikace
  if (entry.supportUrl && entry.supportUrl !== entry.homepage) {
    links.push({ label: t("links.support"), href: entry.supportUrl, Icon: LifeBuoy });
  }

  if (links.length === 0) return null;

  return (
    <nav aria-label={t("links.title")} className="flex flex-wrap items-center gap-2 border-b border-line py-4">
      <span className="mr-1 text-xs font-semibold tracking-wider text-muted uppercase">{t("links.title")}</span>
      {links.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-medium transition-colors hover:bg-surface-2"
        >
          <Icon className="size-4" />
          {label}
          <ExternalLink className="size-3 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </a>
      ))}
    </nav>
  );
}
