/**
 * Manifest WinGetu pro publikování aplikace do komunitního repozitáře
 * microsoft/winget-pkgs (pages/PublishWingetPage.tsx): kontrola údajů podle
 * schématu 1.9 a výstup ve třech souborech (version, defaultLocale, installer),
 * jak je repozitář vyžaduje – manifests/<písmeno>/<Vydavatel>/<Aplikace>/<verze>/.
 */

export const MANIFEST_VERSION = "1.9.0";

export type InstallerType = "msi" | "wix" | "msix" | "inno" | "nullsoft" | "burn" | "exe" | "zip";
export type Architecture = "x64" | "x86" | "arm64" | "neutral";

export interface ManifestData {
  /** Vydavatel.Aplikace (PackageIdentifier). */
  identifier: string;
  version: string;
  name: string;
  publisher: string;
  license: string;
  shortDescription: string;
  description: string;
  /** Web aplikace (PackageUrl). */
  homepage: string;
  publisherUrl: string;
  supportUrl: string;
  privacyUrl: string;
  licenseUrl: string;
  releaseNotesUrl: string;
  copyright: string;
  moniker: string;
  tags: string[];
  locale: string;
  installer: {
    url: string;
    sha256: string;
    type: InstallerType;
    architecture: Architecture;
    /** Instalace pro uživatele / pro všechny (prázdné = instalátor rozhodne sám). */
    scope: "" | "user" | "machine";
    productCode: string;
    /** Jen u typu exe: přepínače tiché instalace. */
    silent: string;
    silentWithProgress: string;
    /** Jen u ZIP: program uvnitř archivu (přenosná aplikace) a příkaz, kterým se spustí. */
    nestedFile: string;
    commandAlias: string;
  };
}

export type ManifestField =
  | "identifier"
  | "version"
  | "name"
  | "publisher"
  | "license"
  | "shortDescription"
  | "description"
  | "homepage"
  | "publisherUrl"
  | "supportUrl"
  | "privacyUrl"
  | "licenseUrl"
  | "releaseNotesUrl"
  | "copyright"
  | "moniker"
  | "tags"
  | "locale"
  | "installerUrl"
  | "sha256"
  | "productCode"
  | "silent"
  | "nestedFile"
  | "commandAlias";

/** Chyba v údaji: pole a klíč textu (i18n publishWinget.error.*). */
export interface ManifestError {
  field: ManifestField;
  error: string;
}

// Vzory ze schématu manifestu 1.9.0
const IDENTIFIER = /^[^.\s\\/:*?"<>|\x01-\x1f]{1,32}(\.[^.\s\\/:*?"<>|\x01-\x1f]{1,32}){1,7}$/;
const VERSION = /^[^\\/:*?"<>|\x01-\x1f]+$/;
const LOCALE = /^([a-zA-Z]{2,3}|[iI]-[a-zA-Z]+|[xX]-[a-zA-Z]{1,8})(-[a-zA-Z]{1,8})*$/;
const URL = /^[Hh][Tt][Tt][Pp][Ss]?:\/\/\S+$/;
const SHA256 = /^[A-Fa-f0-9]{64}$/;
const TAG = /^[a-z0-9][a-z0-9+#.-]*$/;

/** Prázdný formulář. */
export function emptyManifest(): ManifestData {
  return {
    identifier: "",
    version: "",
    name: "",
    publisher: "",
    license: "",
    shortDescription: "",
    description: "",
    homepage: "",
    publisherUrl: "",
    supportUrl: "",
    privacyUrl: "",
    licenseUrl: "",
    releaseNotesUrl: "",
    copyright: "",
    moniker: "",
    tags: [],
    locale: "en-US",
    installer: { url: "", sha256: "", type: "exe", architecture: "x64", scope: "", productCode: "", silent: "", silentWithProgress: "", nestedFile: "", commandAlias: "" },
  };
}

/**
 * Název aplikace z instalátoru bez verze, architektury a „edition“
 * („7-Zip 26.05 (x64 edition)“ → „7-Zip“) – verze a architektura mají v manifestu vlastní pole.
 */
export function cleanProductName(name: string): string {
  const cleaned = name
    .replace(/\([^)]*\b(x64|x86|arm64|amd64|64-bit|32-bit|edition|bit)\b[^)]*\)/gi, "")
    .replace(/\b(x64|x86|arm64|amd64|win64|win32|64-bit|32-bit)\b/gi, "")
    .replace(/\s+v?\d+(\.\d+)+[a-z0-9.+-]*/gi, "")
    .replace(/\s+(version|ver\.?)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–:,]+$/, "")
    .trim();
  return cleaned || name.trim();
}

/** Navržené id z vydavatele a názvu („Acme Corp“ + „Super App“ → „AcmeCorp.SuperApp“). */
export function suggestIdentifier(publisher: string, name: string): string {
  const part = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\b(inc|llc|ltd|gmbh|s\.r\.o|a\.s|corp|corporation|co)\b\.?/gi, "")
      .replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""))
      .replace(/^./, (c) => c.toUpperCase())
      .slice(0, 32);
  const a = part(publisher);
  const b = part(name);
  return a && b ? `${a}.${b}` : "";
}

/** Zkontroluje údaje podle schématu manifestu (a pravidel winget-pkgs – jen https). */
export function validateManifest(d: ManifestData): ManifestError[] {
  const errors: ManifestError[] = [];
  const add = (field: ManifestField, error: string) => errors.push({ field, error });
  const length = (field: ManifestField, value: string, min: number, max: number, required = true) => {
    if (!value.trim()) {
      if (required) add(field, "required");
    } else if (value.trim().length < min || value.trim().length > max) add(field, "length");
  };
  const url = (field: ManifestField, value: string, required = false) => {
    if (!value.trim()) {
      if (required) add(field, "required");
    } else if (!URL.test(value.trim()) || value.length > 2048) add(field, "url");
  };

  if (!d.identifier.trim()) add("identifier", "required");
  else if (!IDENTIFIER.test(d.identifier) || d.identifier.length > 128) add("identifier", "identifier");
  if (!d.version.trim()) add("version", "required");
  else if (!VERSION.test(d.version) || d.version.length > 128) add("version", "version");
  length("name", d.name, 2, 256);
  length("publisher", d.publisher, 2, 256);
  length("license", d.license, 3, 512);
  length("shortDescription", d.shortDescription, 3, 256);
  length("description", d.description, 3, 10000, false);
  length("copyright", d.copyright, 3, 512, false);
  if (!LOCALE.test(d.locale)) add("locale", "locale");
  url("homepage", d.homepage);
  url("publisherUrl", d.publisherUrl);
  url("supportUrl", d.supportUrl);
  url("privacyUrl", d.privacyUrl);
  url("licenseUrl", d.licenseUrl);
  url("releaseNotesUrl", d.releaseNotesUrl);
  // Štítky a moniker se do manifestu zapíší malými písmeny (trimmed)
  const moniker = d.moniker.trim().toLowerCase();
  const tags = [...new Set(d.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (moniker && (!TAG.test(moniker) || moniker.length > 40)) add("moniker", "tag");
  if (tags.length > 16) add("tags", "tooMany");
  else if (tags.some((t) => !TAG.test(t) || t.length > 40)) add("tags", "tag");

  const i = d.installer;
  if (!i.url.trim()) add("installerUrl", "required");
  else if (!/^https:\/\/\S+$/i.test(i.url.trim())) add("installerUrl", "https");
  if (!SHA256.test(i.sha256)) add("sha256", "sha256");
  if (i.productCode.length > 255) add("productCode", "length");
  if (i.type === "exe" && !i.silent.trim()) add("silent", "required");
  if (i.type === "zip") {
    if (!i.nestedFile.trim()) add("nestedFile", "required");
    else if (/^[\\/]|\.\.|:/.test(i.nestedFile)) add("nestedFile", "relative");
    if (i.commandAlias && !/^[A-Za-z0-9._-]{1,40}$/.test(i.commandAlias)) add("commandAlias", "tag");
  }
  return errors;
}

// ── YAML ─────────────────────────────────────────────────────────────────

/** Hodnota, kterou YAML přečte jako číslo, logickou hodnotu nebo null – musí být v uvozovkách. */
const AMBIGUOUS = /^(true|false|yes|no|on|off|y|n|null|~|[-+]?(\d[\d_]*)?(\.\d*)?([eE][-+]?\d+)?|0x[0-9a-f]+|0o[0-7]+|\.inf|\.nan)$/i;

/** Skalár YAML: bez uvozovek, kde to jde, jinak v dvojitých uvozovkách (escapování jako JSON). */
export function yamlScalar(value: string): string {
  const plain =
    value.length > 0 &&
    !AMBIGUOUS.test(value) &&
    /^[^\s\-?:,[\]{}#&*!|>'"%@`]/.test(value) &&
    !/[:#]\s|\s#|:$|^\s|\s$|[\r\n\t]/.test(value) &&
    !/[\u0000-\u001f\u007f]/.test(value);
  return plain ? value : JSON.stringify(value);
}

/** Víceřádkový text jako blok „|-“ (popis), jinak skalár. */
function yamlText(value: string, indent = ""): string {
  if (!value.includes("\n")) return yamlScalar(value);
  return `|-\n${value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `${indent}  ${line}`.trimEnd())
    .join("\n")}`;
}

type Line = [key: string, value: string | string[] | undefined, raw?: boolean];

function yamlLines(lines: Line[], indent = ""): string {
  const out: string[] = [];
  for (const [key, value, raw] of lines) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    if (Array.isArray(value)) out.push(`${indent}${key}:`, ...value.map((v) => `${indent}- ${yamlScalar(v)}`));
    else out.push(`${indent}${key}: ${raw ? value : yamlText(value, indent)}`);
  }
  return out.join("\n");
}

// Repozitář winget-pkgs je anglický – komentář v manifestu taky
const header = (type: string) =>
  `# Created with Unibox – open-source app store for Windows\n# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.${MANIFEST_VERSION}.schema.json\n\n`;

export interface ManifestFile {
  name: string;
  content: string;
}

/** Tři soubory manifestu (version, defaultLocale, installer). */
export function manifestFiles(raw: ManifestData): ManifestFile[] {
  const d = trimmed(raw);
  const id = d.identifier;
  const base: Line[] = [
    ["PackageIdentifier", id],
    ["PackageVersion", d.version],
  ];

  const version = yamlLines([...base, ["DefaultLocale", d.locale], ["ManifestType", "version", true], ["ManifestVersion", MANIFEST_VERSION, true]]);

  const locale = yamlLines([
    ...base,
    ["PackageLocale", d.locale],
    ["Publisher", d.publisher],
    ["PublisherUrl", d.publisherUrl],
    ["PublisherSupportUrl", d.supportUrl],
    ["PrivacyUrl", d.privacyUrl],
    ["PackageName", d.name],
    ["PackageUrl", d.homepage],
    ["License", d.license],
    ["LicenseUrl", d.licenseUrl],
    ["Copyright", d.copyright],
    ["ShortDescription", d.shortDescription],
    ["Description", d.description],
    ["Moniker", d.moniker],
    ["Tags", d.tags],
    ["ReleaseNotesUrl", d.releaseNotesUrl],
    ["ManifestType", "defaultLocale", true],
    ["ManifestVersion", MANIFEST_VERSION, true],
  ]);

  const i = d.installer;
  const zip = i.type === "zip";
  const installerLines: Line[] = [
    ...base,
    ["InstallerType", i.type, true],
    ["NestedInstallerType", zip ? "portable" : undefined, true],
    ["Scope", i.scope || undefined, true],
    ["UpgradeBehavior", zip ? undefined : "install", true],
    ["ProductCode", i.productCode],
  ];
  let installer = yamlLines(installerLines);
  if (zip) {
    installer += `\nNestedInstallerFiles:\n${yamlLines([["RelativeFilePath", i.nestedFile.replace(/\//g, "\\")], ["PortableCommandAlias", i.commandAlias]], "  ").replace(/^ {2}/, "- ")}`;
  }
  if (i.type === "exe") {
    installer += `\nInstallerSwitches:\n${yamlLines([["Silent", i.silent], ["SilentWithProgress", i.silentWithProgress || i.silent]], "  ")}`;
  }
  installer += `\nInstallers:\n${yamlLines(
    [
      ["Architecture", i.architecture, true],
      ["InstallerUrl", i.url],
      ["InstallerSha256", i.sha256.toUpperCase(), true],
    ],
    "  ",
  ).replace(/^ {2}/, "- ")}`;
  installer += `\n${yamlLines([["ManifestType", "installer", true], ["ManifestVersion", MANIFEST_VERSION, true]])}`;

  return [
    { name: `${id}.yaml`, content: `${header("version")}${version}\n` },
    { name: `${id}.locale.${d.locale}.yaml`, content: `${header("defaultLocale")}${locale}\n` },
    { name: `${id}.installer.yaml`, content: `${header("installer")}${installer}\n` },
  ];
}

/** Složka manifestu v repozitáři winget-pkgs. */
export function manifestPath(d: ManifestData): string {
  const id = d.identifier.trim();
  return `manifests/${id[0]?.toLowerCase() ?? "_"}/${id.split(".").join("/")}/${d.version.trim()}`;
}

/** Název a popis pull requestu (šablona winget-pkgs; ověření zaškrtnuté, jen když proběhlo). */
export function pullRequest(d: ManifestData, isUpdate: boolean, validated: boolean) {
  const id = d.identifier.trim();
  const version = d.version.trim();
  return {
    title: `${isUpdate ? "New version" : "New package"}: ${id} version ${version}`,
    body: [
      "Checklist for Pull Requests",
      "- [ ] Have you signed the [Contributor License Agreement](https://cla.opensource.microsoft.com/microsoft/winget-pkgs)?",
      "- [ ] Is there a linked Issue?",
      "",
      "Manifests",
      "- [x] Have you checked that there aren't other open [pull requests](https://github.com/microsoft/winget-pkgs/pulls) for the same manifest update/change?",
      "- [x] This PR only modifies one (1) manifest",
      `- [${validated ? "x" : " "}] Have you [validated](https://github.com/microsoft/winget-pkgs/blob/master/doc/Authoring.md#validation) your manifest locally with \`winget validate --manifest <path>\`?`,
      "- [ ] Have you tested your manifest locally with `winget install --manifest <path>`?",
      `- [x] Does your manifest conform to the [${MANIFEST_VERSION.replace(/\.0$/, "")} schema](https://github.com/microsoft/winget-pkgs/tree/master/doc/manifest/schema/${MANIFEST_VERSION})?`,
      "",
      "---",
      "Created with [Unibox](https://github.com/) – open-source app store for Windows.",
    ].join("\n"),
  };
}

/** Údaje bez okrajových mezer (tagy malými písmeny, bez prázdných). */
function trimmed(d: ManifestData): ManifestData {
  const t = (v: string) => v.trim();
  return {
    ...d,
    identifier: t(d.identifier),
    version: t(d.version),
    name: t(d.name),
    publisher: t(d.publisher),
    license: t(d.license),
    shortDescription: t(d.shortDescription),
    description: d.description.trim(),
    homepage: t(d.homepage),
    publisherUrl: t(d.publisherUrl),
    supportUrl: t(d.supportUrl),
    privacyUrl: t(d.privacyUrl),
    licenseUrl: t(d.licenseUrl),
    releaseNotesUrl: t(d.releaseNotesUrl),
    copyright: t(d.copyright),
    moniker: t(d.moniker).toLowerCase(),
    tags: [...new Set(d.tags.map((x) => x.trim().toLowerCase()).filter(Boolean))],
    installer: {
      ...d.installer,
      url: t(d.installer.url),
      sha256: t(d.installer.sha256),
      productCode: t(d.installer.productCode),
      silent: t(d.installer.silent),
      silentWithProgress: t(d.installer.silentWithProgress),
      nestedFile: t(d.installer.nestedFile),
      commandAlias: t(d.installer.commandAlias),
    },
  };
}
