import { useQuery } from "@tanstack/react-query";
import { getSystemInfo } from "@/lib/tauri";

/** Údaje o počítači z backendu (jen v desktopové aplikaci, jinak null). Zjistí se jednou. */
export function useSystemInfo() {
  const { data } = useQuery({ queryKey: ["system-info"], queryFn: getSystemInfo, staleTime: Infinity });
  return data ?? null;
}
