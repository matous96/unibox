/**
 * Záchytná síť pro chyby při vykreslování – jinak by výjimka v jediné
 * komponentě odpojila celé okno (bílá obrazovka). Tři úrovně:
 *  - AppCrash: celá aplikace (main.tsx) – „Načíst znovu“,
 *  - PageCrash: obsah stránky (Layout) – „Zkusit znovu“ / „Domů“, zbytek okna běží,
 *  - bez náhrady (fallback null): dialogy – vadný dialog zmizí.
 * Chyby se zapíší do konzole a do historie oznámení (zvoneček), ať jdou nahlásit.
 */
import { AlertTriangle, Copy, Home, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { reportError } from "@/lib/errors";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Co ukázat místo spadlé části; reset ji zkusí vykreslit znovu. Vynecháno = nic. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Změna klíče chybu zapomene (např. přechod na jinou stránku). */
  resetKey?: unknown;
  /** Kde se chyba stala (do protokolu). */
  name: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, `${this.props.name}${info.componentStack ? `\n${info.componentStack}` : ""}`);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return this.props.fallback ? this.props.fallback(this.state.error, this.reset) : null;
  }
}

/** Podrobnosti chyby do schránky (pro hlášení chyby). */
const copyDetails = (error: Error) => void navigator.clipboard?.writeText(`${error.name}: ${error.message}\n${error.stack ?? ""}`).catch(() => undefined);

/** Spadlý obsah stránky – zbytek okna (panel, horní lišta, fronta) běží dál. */
export function PageCrash({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle className="size-7" />
      </span>
      <h1 className="font-display text-2xl font-bold">{t("crash.pageTitle")}</h1>
      <p className="text-sm text-muted">{t("crash.pageText")}</p>
      <p className="max-w-full truncate rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-xs text-muted" title={error.message}>
        {error.message || error.name}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-4" />
          {t("crash.retry")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            reset();
            navigate("/");
          }}
        >
          <Home className="size-4" />
          {t("crash.home")}
        </Button>
        <Button variant="ghost" onClick={() => copyDetails(error)}>
          <Copy className="size-4" />
          {t("crash.copy")}
        </Button>
      </div>
    </div>
  );
}

/** Spadla celá aplikace (i rozvržení okna) – jediná cesta je načíst ji znovu. */
export function AppCrash({ error }: { error: Error }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 bg-app p-8 text-center text-fg">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle className="size-7" />
      </span>
      <h1 className="font-display text-2xl font-bold">{t("crash.appTitle")}</h1>
      <p className="max-w-md text-sm text-muted">{t("crash.appText")}</p>
      <p className="max-w-lg truncate rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-xs text-muted" title={error.message}>
        {error.message || error.name}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>
          <RotateCcw className="size-4" />
          {t("crash.reload")}
        </Button>
        <Button variant="ghost" onClick={() => copyDetails(error)}>
          <Copy className="size-4" />
          {t("crash.copy")}
        </Button>
      </div>
    </div>
  );
}
