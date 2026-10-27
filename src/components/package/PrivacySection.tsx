import {
  BarChart3,
  BookUser,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  FlaskConical,
  History,
  IdCard,
  Images,
  Navigation,
  ScanEye,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useCatalog } from "@/hooks/usePackages";
import type { CatalogEntry, PrivacyCategory } from "@/types";

/** Ikona pro každou kategorii údajů. */
const CATEGORY_ICON: Record<PrivacyCategory, LucideIcon> = {
  purchases: ShoppingBag,
  financial: CreditCard,
  location: Navigation,
  contactInfo: BookUser,
  contacts: CircleUserRound,
  userContent: Images,
  searchHistory: Search,
  browsingHistory: History,
  identifiers: IdCard,
  usage: BarChart3,
  diagnostics: Settings,
};

/**
 * „Ochrana soukromí v aplikaci“ ve stylu App Store: karty se štítky soukromí,
 * které uvádí vývojář (sledování / spojené s vámi / nespojené s vámi),
 * odkaz na zásady ochrany osobních údajů z manifestu.
 */
export function PrivacySection({ entry }: { entry: CatalogEntry }) {
  const { t } = useTranslation();
  const { data } = useCatalog();
  const privacy = entry.privacy;
  const isSample = !!data?.catalog.sample && !!privacy;
  const noData = privacy && !privacy.tracking.length && !privacy.linked.length && !privacy.notLinked.length;

  const policyLink = (children?: ReactNode) =>
    entry.privacyUrl ? (
      <a href={entry.privacyUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );

  return (
    <section className="border-t border-line py-6">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-2xl font-bold">
          {entry.privacyUrl ? (
            <a href={entry.privacyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
              {t("privacy.title")}
              <ChevronRight className="size-6 text-muted" />
            </a>
          ) : (
            t("privacy.title")
          )}
        </h2>
        {isSample && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <FlaskConical className="size-3" />
            {t("reviews.sample")}
          </span>
        )}
      </div>

      {privacy ? (
        <p className="mt-2 max-w-4xl text-[15px] leading-relaxed">
          <Trans
            i18nKey={entry.privacyUrl ? "privacy.intro" : "privacy.introNoLink"}
            values={{ publisher: entry.publisher }}
            components={{ b: <strong />, policy: policyLink() }}
          />
        </p>
      ) : (
        <p className="mt-2 text-[15px] text-muted">
          {t("privacy.notProvided")}{" "}
          {entry.privacyUrl && policyLink(t("privacy.policyLink"))}
        </p>
      )}

      {privacy && (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {noData && (
            <PrivacyCard icon={ShieldCheck} title={t("privacy.noDataTitle")} text={t("privacy.noDataText")} tone="success" />
          )}
          {privacy.tracking.length > 0 && (
            <PrivacyCard icon={ScanEye} title={t("privacy.trackingTitle")} text={t("privacy.trackingText")} items={privacy.tracking} />
          )}
          {privacy.linked.length > 0 && (
            <PrivacyCard icon={UserRound} title={t("privacy.linkedTitle")} text={t("privacy.linkedText")} items={privacy.linked} />
          )}
          {privacy.notLinked.length > 0 && (
            <PrivacyCard icon={UserRoundX} title={t("privacy.notLinkedTitle")} text={t("privacy.notLinkedText")} items={privacy.notLinked} />
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        {t("privacy.disclaimer")}{" "}
        <Link to="/publish" className="text-accent hover:underline">
          {t("privacy.forDevelopers")}
        </Link>
      </p>
    </section>
  );
}

function PrivacyCard({
  icon: Icon,
  title,
  text,
  items,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  items?: PrivacyCategory[];
  tone?: "success";
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface p-6 text-center shadow-card ring-1 ring-line">
      <Icon className={tone === "success" ? "size-9 text-success" : "size-9 text-accent"} strokeWidth={1.75} />
      <p className="mt-3 text-lg font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>
      {items && (
        <ul className={items.length > 1 ? "mt-5 grid w-full grid-cols-2 gap-x-4 gap-y-3 text-left" : "mt-5 flex justify-center"}>
          {items.map((c) => {
            const CategoryIcon = CATEGORY_ICON[c];
            return (
              <li key={c} className="flex items-center gap-2.5 text-sm">
                <CategoryIcon className="size-4 shrink-0" />
                {t(`privacy.categories.${c}`)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
