/**
 * Varianty balíčků wingetu – jazykové verze a jiné typy instalátoru téže
 * aplikace („Mozilla.Firefox.cs“, „Google.Chrome.EXE“). Katalog je slučuje
 * do karty základního balíčku a nainstalovaná varianta se spáruje s ní.
 * Sdílí aplikace i generátor katalogu (data-pipeline/src/build/match.ts) –
 * proto modul nic neimportuje.
 */

/** Přípony typů instalátoru. */
const INSTALLER_SUFFIX = /^(EXE|MSI|MSIX|APPX|exe|msi|msix|appx)$/;

/** Jazykový kód: „cs“, „ast“, „en-GB“, „pt-BR“, „zh-Hans“. */
const LANGUAGE_SUFFIX = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

/** Krátké přípony, které nejsou jazykem, ale samostatnou edicí („.dev“, „.cli“…). */
const NOT_LANGUAGE = new Set([
  "dev", "pre", "app", "cli", "gui", "lts", "pro", "web", "api", "sdk", "cmd", "ui", "ce", "ee", "rc", "js",
  "ai", "vr", "hd", "tv", "go", "io", "db", "ml", "net", "x64", "x86", "arm", "old", "new", "beta", "alpha",
]);

/** Základní id a přípona varianty, nebo null („Mozilla.Firefox.cs“ → { base: „Mozilla.Firefox“, code: „cs“ }). */
export function wingetVariant(id: string): { base: string; code: string } | null {
  const dot = id.lastIndexOf(".");
  if (dot <= 0) return null;
  const base = id.slice(0, dot);
  const code = id.slice(dot + 1);
  // Základ musí mít aspoň dvě části („Vydavatel.Balíček“)
  if (!base.includes(".")) return null;
  if (INSTALLER_SUFFIX.test(code)) return { base, code: code.toUpperCase() };
  if (LANGUAGE_SUFFIX.test(code) && !NOT_LANGUAGE.has(code.toLowerCase())) return { base, code };
  return null;
}

/** Základní id varianty, nebo null („Google.Chrome.EXE“ → „Google.Chrome“). */
export const wingetBaseId = (id: string) => wingetVariant(id)?.base ?? null;
