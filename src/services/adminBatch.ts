import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/tauri";
import { useJobs, type EnqueueRequest } from "@/store/jobs";

/**
 * Dávka operací s jediným dialogem UAC („Čeká na potvrzení“ → Aktualizovat jako správce):
 * po dobu dávky obslouží backend povýšené operace jedním pomocníkem relace a po poslední
 * z nich ho ukončí (ledaže je zapnuté „Požádat o oprávnění správce pouze jednou“).
 * Odmítnutý dialog UAC zruší zbytek dávky bez dalších dotazů. Vrátí se po konci dávky.
 */
export async function runAdminBatch(requests: EnqueueRequest[]): Promise<void> {
  if (!requests.length) return;
  if (isTauri()) await invoke("elevated_batch_begin").catch(() => undefined);
  const ids = requests.map((r) => r.appId);
  const { enqueue } = useJobs.getState();
  for (const request of requests) enqueue(request);
  // Konec dávky, až ve frontě nezůstane žádná z jejích úloh
  const finished = (jobs: Record<string, unknown>) => !ids.some((id) => jobs[id]);
  if (!finished(useJobs.getState().jobs)) {
    await new Promise<void>((resolve) => {
      const unsubscribe = useJobs.subscribe((state) => {
        if (!finished(state.jobs)) return;
        unsubscribe();
        resolve();
      });
    });
  }
  if (isTauri()) await invoke("elevated_batch_end").catch(() => undefined);
}
