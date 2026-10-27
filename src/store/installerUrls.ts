/**
 * Adresy instalátorů wingetu pro jednotlivé verze balíčků – pro varování, když
 * se mezi nainstalovanou a novou verzí změní server, odkud se instalátor
 * stahuje (po vzoru UniGetUI; Nastavení → Aktualizace balíčků → Bezpečnost).
 * Jiný server může znamenat převzatý balíček nebo podvržený manifest.
 *
 * Manifest verze se nemění, proto se výsledek ukládá natrvalo (`winget show`
 * trvá 1–2 s). Zjišťuje se postupně, jedna verze po druhé.
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isTauri } from "@/lib/tauri";
import type { InstalledPackage } from "@/types";
import { useAutoUpdates } from "./autoUpdates";

/** Kolik verzí si pamatovat (nejstarší záznamy se zahodí). */
const KEEP = 400;

interface InstallerUrlsState {
  /** „Id@verze“ → adresa instalátoru, null = nezjištěno (verze v repozitáři už není). */
  urls: Record<string, string | null>;
  put: (key: string, url: string | null) => void;
}

export const useInstallerUrls = create<InstallerUrlsState>()(
  persist(
    (set, get) => ({
      urls: {},
      put: (key, url) => {
        const urls = { ...get().urls, [key]: url };
        const keys = Object.keys(urls);
        for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) delete urls[old];
        set({ urls });
      },
    }),
    { name: "unibox-installer-urls" },
  ),
);

const urlKey = (packageId: string, version: string) => `${packageId}@${version}`;
const pending = new Map<string, Promise<string | null>>();
let chain: Promise<unknown> = Promise.resolve();

/** Adresa instalátoru verze – z paměti, jinak ji zjistí (`winget show`, jedna po druhé). */
export function installerUrl(packageId: string, version: string): Promise<string | null> {
  const key = urlKey(packageId, version);
  const known = useInstallerUrls.getState().urls[key];
  if (known !== undefined) return Promise.resolve(known);
  if (!isTauri()) return Promise.resolve(null);
  let request = pending.get(key);
  if (!request) {
    request = chain
      .then(() => invoke<string | null>("winget_installer_url", { packageId, version }))
      .catch(() => null)
      .then((url) => {
        useInstallerUrls.getState().put(key, url);
        pending.delete(key);
        return url;
      });
    chain = request;
    pending.set(key, request);
  }
  return request;
}

/** Server z adresy („github.com“; bez „www.“). */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export interface HostChange {
  from: string;
  to: string;
  fromUrl: string;
  toUrl: string;
}

/** Nainstalovaná verze, kterou jde v repozitáři dohledat (ne „Unknown“, „< 1.2“…). */
const realVersion = (version: string) => /^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(version) && /\d/.test(version);

/** Týká se balíček kontroly serveru instalátoru? (winget, nabízená aktualizace, zapnuté varování) */
function applies(pkg: InstalledPackage | undefined): pkg is InstalledPackage & { availableVersion: string } {
  return (
    !!pkg &&
    pkg.source === "winget" &&
    !!pkg.availableVersion &&
    realVersion(pkg.installedVersion) &&
    useAutoUpdates.getState().warnHostChange
  );
}

function compare(fromUrl: string | null | undefined, toUrl: string | null | undefined): HostChange | null {
  if (!fromUrl || !toUrl) return null;
  const from = hostOf(fromUrl);
  const to = hostOf(toUrl);
  return from && to && from !== to ? { from, to, fromUrl, toUrl } : null;
}

/** Změnil se server instalátoru mezi nainstalovanou a nabízenou verzí? (mimo React – automatické aktualizace) */
export async function installerHostChange(pkg: InstalledPackage): Promise<HostChange | null> {
  if (!applies(pkg)) return null;
  const [fromUrl, toUrl] = await Promise.all([
    installerUrl(pkg.packageId, pkg.installedVersion),
    installerUrl(pkg.packageId, pkg.availableVersion),
  ]);
  return compare(fromUrl, toUrl);
}

/** Totéž pro kartu a detail aplikace – adresy zjistí na pozadí, výsledek ukáže, až je zná. */
export function useInstallerHostChange(pkg: InstalledPackage | undefined): HostChange | null {
  const enabled = useAutoUpdates((s) => s.warnHostChange);
  const target = enabled && applies(pkg) ? pkg : undefined;
  const fromKey = target ? urlKey(target.packageId, target.installedVersion) : null;
  const toKey = target ? urlKey(target.packageId, target.availableVersion) : null;
  const fromUrl = useInstallerUrls((s) => (fromKey ? s.urls[fromKey] : undefined));
  const toUrl = useInstallerUrls((s) => (toKey ? s.urls[toKey] : undefined));
  useEffect(() => {
    if (target) void installerHostChange(target);
  }, [target]);
  return target ? compare(fromUrl, toUrl) : null;
}
