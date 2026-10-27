/**
 * Odkazy unibox:// (web Uniboxu, sdílené sady): odkaz, kterým byl Unibox
 * spuštěn, i odkazy otevřené za běhu (předá je druhé spuštění) → přechod
 * na příslušnou stránku. Okno ukáže backend (single-instance).
 */
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { deepLinkToPath } from "@/lib/deepLink";
import { isTauri } from "@/lib/tauri";

/** Odkaz ze spuštění se zpracuje jen jednou (ne znovu po remountu komponenty). */
let startupHandled = false;

export function useDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri()) return;
    const open = (urls: string[] | null) => {
      const path = (urls ?? []).map(deepLinkToPath).find(Boolean);
      if (path) navigate(path);
    };
    if (!startupHandled) {
      startupHandled = true;
      getCurrent().then(open, () => undefined);
    }
    const listening = onOpenUrl(open);
    return () => void listening.then((stop) => stop(), () => undefined);
  }, [navigate]);
}
