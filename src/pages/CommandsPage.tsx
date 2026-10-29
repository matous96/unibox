/**
 * Příkazy pro terminál: výuka pro všechny správce balíčků (components/settings/CommandGuide).
 * Kdo má raději příkazový řádek, nemusí příkazy hledat na internetu. Stejná výuka je
 * i v Nastavení → Příkazy pro terminál.
 */
import { useTranslation } from "react-i18next";
import { CommandGuide } from "@/components/settings/CommandGuide";
import { PageHeader } from "@/components/ui/States";

export function CommandsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("commands.title")} subtitle={t("commands.subtitle")} />
      <CommandGuide />
    </div>
  );
}
