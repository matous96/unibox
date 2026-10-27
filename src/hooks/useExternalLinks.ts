import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/tauri";

/**
 * V desktopové aplikaci otevírá odkazy ven (http/https, mailto) v systémovém
 * prohlížeči a e-mailovém klientovi – okno WebView2 by je jinak načetlo
 * samo do sebe a uživatel by se z obchodu „ztratil“. V prohlížeči nedělá nic.
 */
export function useExternalLinks() {
  useEffect(() => {
    if (!isTauri()) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const href = link?.getAttribute("href");
      if (!href || !/^(https?:|mailto:)/i.test(href)) return;
      event.preventDefault();
      void openUrl(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}
