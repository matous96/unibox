/**
 * Převod minimální verze Windows z manifestu (MinimumOSVersion, např.
 * „10.0.17763.0“) na čitelný název („Windows 10 verze 1809“).
 */

/** Čísla sestavení Windows 10 → označení verze. */
const WIN10: [number, string][] = [
  [10240, "1507"], [10586, "1511"], [14393, "1607"], [15063, "1703"], [16299, "1709"], [17134, "1803"],
  [17763, "1809"], [18362, "1903"], [18363, "1909"], [19041, "2004"], [19042, "20H2"], [19043, "21H1"],
  [19044, "21H2"], [19045, "22H2"],
];

/** Čísla sestavení Windows 11 → označení verze. */
const WIN11: [number, string][] = [
  [22000, "21H2"], [22621, "22H2"], [22631, "23H2"], [26100, "24H2"], [26200, "25H2"],
];

export interface WindowsRequirement {
  /** Nejstarší podporovaný systém; null = jakékoli Windows 10 a 11. */
  os: "Windows 10" | "Windows 11" | null;
  /** Označení verze („1809“), pokud je požadavek přísnější než první vydání. */
  version: string | null;
}

export function windowsRequirement(minOsVersion: string | null | undefined): WindowsRequirement {
  const build = Number(minOsVersion?.split(".")[2] ?? 0);
  if (!build || build <= 10240) return { os: null, version: null };
  if (build >= 22000) {
    const match = [...WIN11].reverse().find(([b]) => build >= b);
    return { os: "Windows 11", version: match && match[0] > 22000 ? match[1] : null };
  }
  const match = [...WIN10].reverse().find(([b]) => build >= b);
  return { os: "Windows 10", version: match?.[1] ?? null };
}
