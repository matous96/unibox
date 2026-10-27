import { FlaskConical, Heart, Lock, RefreshCw, Star } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { GitHubIcon, GoogleIcon, MicrosoftIcon } from "@/components/ui/BrandIcons";
import { UniboxLogo } from "@/components/ui/Logo";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import { auth, type AuthProvider } from "@/services/auth";
import { useAuth } from "@/store/auth";

const PROVIDERS: { id: AuthProvider; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "github", label: "GitHub", Icon: GitHubIcon },
  { id: "microsoft", label: "Microsoft", Icon: MicrosoftIcon },
  { id: "google", label: "Google", Icon: GoogleIcon },
];

/**
 * Dialog přihlášení: logo, důvod (obecně / kvůli recenzi), výhody účtu
 * a tlačítka poskytovatelů. Přihlášení probíhá v systémovém prohlížeči
 * (OAuth), aplikace nikdy nevidí heslo.
 */
export function LoginDialog() {
  const { t } = useTranslation();
  const { dialogOpen, reason, pending, closeLogin, signIn } = useAuth();

  const benefits = [
    { Icon: Star, text: t("auth.benefitReviews") },
    { Icon: RefreshCw, text: t("auth.benefitSync") },
    { Icon: Heart, text: t("auth.benefitFavorites") },
  ];
  const reasonKey = { review: "auth.reasonReview", screenshot: "auth.reasonScreenshot", general: "auth.reasonGeneral" }[reason];

  return (
    <Modal
      open={dialogOpen}
      onClose={closeLogin}
      title={<span className="sr-only">{t("auth.title")}</span>}
      className="max-w-md"
    >
      <div className="flex flex-col items-center text-center">
        <UniboxLogo size={56} className="rounded-[13px] shadow-lg shadow-accent/30" />
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">{t("auth.title")}</h2>
        <p className="mt-1.5 text-sm text-muted">{t(reasonKey)}</p>
      </div>

      {/* Výhody přihlášení */}
      <ul className="mt-5 flex flex-col gap-2.5 rounded-2xl bg-surface-2 p-4">
        {benefits.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
              <Icon className="size-3.5" />
            </span>
            {text}
          </li>
        ))}
      </ul>

      {/* Poskytovatelé – jen ti, které přihlášení nabízí (Supabase: GitHub a Google) */}
      <div className="mt-5 flex flex-col gap-2">
        {PROVIDERS.filter((p) => auth.providers.includes(p.id)).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={pending !== null}
            onClick={() => void signIn(id)}
            className={cn(
              "relative flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-line bg-surface text-sm font-semibold transition-colors hover:bg-surface-2",
              "disabled:cursor-default disabled:opacity-60 disabled:hover:bg-surface",
              pending === id && "disabled:opacity-100",
            )}
          >
            {pending === id ? <Spinner className="size-4" /> : <Icon className="size-[18px]" />}
            {pending === id ? t("auth.waiting", { provider: label }) : t("auth.continueWith", { provider: label })}
          </button>
        ))}
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
        <Lock className="size-3" />
        {t("auth.privacy")}
      </p>

      {auth.isSample && (
        <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <FlaskConical className="size-3.5 shrink-0" />
          {t("auth.sample")}
        </p>
      )}
    </Modal>
  );
}
