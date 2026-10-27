/**
 * Stav správce balíčků v systému (nainstalovaný / chybí, verze) a jeho
 * instalace přes WinGet. Sdílí ho Nastavení → Správci i přehled správce
 * pro vývojáře (levý panel → npm, pip, Cargo…).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, queryKeys } from "@/app/queryClient";
import { managers } from "@/services/managers";
import type { SourceId } from "@/types";

export function useManagerStatus(source: SourceId) {
  const status = useQuery({ queryKey: queryKeys.managerStatus(source), queryFn: () => managers[source].getStatus() });
  const setup = useMutation({
    mutationFn: () => managers[source].setup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.managerStatus(source) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.installed });
    },
  });
  // vcpkg nejde nainstalovat automaticky (winget ho nemá) – místo tlačítka návod
  return { status, setup, canSetup: source !== "vcpkg" };
}
