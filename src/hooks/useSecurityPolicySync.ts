/**
 * Posílá nastavení z Nastavení → Oprávnění správce do backendu (po startu
 * a při každé změně) – podle něj backend řídí UAC, vlastní argumenty,
 * příkazy před / po instalaci a cesty ke správcům balíčků (security.rs).
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { isTauri } from "@/lib/tauri";
import { backendPolicy, useSecurity } from "@/store/security";

export function useSecurityPolicySync() {
  const security = useSecurity();
  const policy = JSON.stringify(backendPolicy(security));

  useEffect(() => {
    if (isTauri()) invoke("set_security_policy", { policy: JSON.parse(policy) }).catch(() => undefined);
  }, [policy]);
}
