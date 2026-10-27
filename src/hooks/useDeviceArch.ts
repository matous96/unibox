import { useQuery } from "@tanstack/react-query";
import { getDeviceArch } from "@/lib/arch";

/** Architektura tohoto počítače (zjistí se jednou, pak se drží v paměti). */
export function useDeviceArch() {
  const { data } = useQuery({ queryKey: ["device-arch"], queryFn: getDeviceArch, staleTime: Infinity });
  return data ?? null;
}
