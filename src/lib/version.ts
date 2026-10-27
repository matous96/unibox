/**
 * Porovná čísla verzí po částech jako čísla („0.1.11“ je novější než „0.1.9“).
 * Záporné = a je starší, 0 = stejné, kladné = a je novější.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => version.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}
