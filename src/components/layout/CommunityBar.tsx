import { Heart, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { AccountButton } from "@/components/auth/AccountButton";
import { GitHubIcon } from "@/components/ui/BrandIcons";
import { CONTACT_EMAIL, FORUM_URL, GITHUB_URL } from "@/config";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationCenter } from "./NotificationCenter";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Pravá část horní lišty: štítek Open source, odkazy na GitHub, Discord
 * a kontaktní e-mail, centrum oznámení (zvoneček), vpravo přepínač
 * tmavého / světlého režimu, jazyka a přihlášení / účet.
 * (Zdroje balíčků jsou v levém panelu – viz SourcesPanel.)
 */
export function CommunityBar() {
  const { t } = useTranslation();

  const iconLink =
    "flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  const textLink = "rounded-full px-3 py-1.5 text-sm font-semibold text-fg/80 transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {/* Textové odkazy jako na Flathubu: pro vývojáře a komunitu */}
      <nav className="mr-1 hidden items-center xl:flex">
        <NavLink to="/publish" className={({ isActive }) => cn(textLink, isActive && "bg-surface-2 text-fg")}>
          {t("nav.publish")}
        </NavLink>
        <a href={FORUM_URL} target="_blank" rel="noreferrer" className={textLink}>
          {t("nav.forum")}
        </a>
        <NavLink to="/about" className={({ isActive }) => cn(textLink, isActive && "bg-surface-2 text-fg")}>
          {t("nav.about")}
        </NavLink>
      </nav>

      {/* Open source */}
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        title={t("community.openSourceTitle")}
        className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/15 lg:inline-flex dark:text-emerald-400"
      >
        <Heart className="size-3 fill-current" />
        {t("community.openSource")}
      </a>

      <a href={GITHUB_URL} target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub" className={iconLink}>
        <GitHubIcon className="size-[18px]" />
      </a>
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        title={t("community.email", { email: CONTACT_EMAIL })}
        aria-label={t("community.emailLabel")}
        className={iconLink}
      >
        <Mail className="size-[18px]" />
      </a>

      {/* Historie oznámení a chyb (odznak s počtem nových chyb) */}
      <NotificationCenter />

      <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />

      {/* Tmavý / světlý režim */}
      <ThemeToggle />

      {/* Jazyk aplikace */}
      <LanguageSwitcher />

      {/* Přihlášení / účet */}
      <AccountButton />
    </div>
  );
}
