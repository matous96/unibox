/**
 * Uložení souboru s oznámením: v desktopové aplikaci „Uloženo do …“ (cesta
 * vybraná v dialogu), při chybě chybová hláška. Zavřený dialog nic nehlásí.
 */
import { useTranslation } from "react-i18next";
import { saveTextFile } from "@/lib/download";
import { useToasts } from "@/store/toasts";

export function useSaveFile() {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.push);

  /**
   * Vrátí true, když se soubor uložil (nebo ho stáhl prohlížeč). `describe`
   * nahradí obecné „Uloženo do …“ vlastní zprávou (např. kolik aplikací).
   */
  return async (filename: string, content: string, mime?: string, describe?: (path: string) => string): Promise<boolean> => {
    try {
      const path = await saveTextFile(filename, content, mime);
      if (path) toast("success", describe ? describe(path) : t("files.saved", { path }));
      return path !== null;
    } catch (error) {
      console.error("Soubor se nepodařilo uložit:", error);
      toast("error", t("files.saveFailed"));
      return false;
    }
  };
}
