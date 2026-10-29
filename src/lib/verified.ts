/**
 * Ověřené oficiální aplikace (modrá fajfka u názvu): vydavatel je na seznamu
 * známých firem, nadací a projektů – Microsoft, Mozilla, Blender Foundation,
 * Valve… Aplikace navíc pochází z oficiálního repozitáře správce balíčků
 * (winget, Chocolatey, Scoop), takže fajfka znamená „oficiální vydavatel
 * z bezpečného zdroje“. Pravidlo sdílí aplikace i generátor katalogu
 * (data-pipeline/src/build/catalog.ts nastaví `verified`) – proto modul nic neimportuje.
 */

/** Co ověření potřebuje z profilu aplikace (CatalogEntry). */
interface PublisherInfo {
  publisher: string;
  verified?: boolean;
}

/**
 * Vydavatelé po normalizaci (malá písmena, bez diakritiky, interpunkce
 * a právní formy – „Microsoft Corporation“ = „microsoft“, „JetBrains s.r.o.“ = „jetbrains“).
 */
const OFFICIAL_PUBLISHERS = new Set([
  // Velké technologické firmy
  "microsoft", "google", "apple", "amazon", "amazon web services", "meta", "meta platforms", "facebook",
  "oracle", "ibm", "red hat", "redhat", "canonical", "cisco systems", "citrix systems", "vmware",
  "vmware by broadcom", "broadcom", "dell", "hp", "lenovo", "intel", "nvidia", "amd", "advanced micro devices",
  "qualcomm", "samsung electronics", "logitech", "corsair memory", "razer", "asus", "asustek computer",
  // Vývojářské nástroje a služby
  "github", "gitlab", "atlassian", "jetbrains", "docker", "hashicorp", "elastic", "mongodb", "grafana labs",
  "postman", "figma", "notion labs", "slack technologies", "zoom video communications", "dropbox", "unity technologies",
  "epic games", "autodesk", "adobe", "adobe systems", "anaconda", "jfrog", "sublime hq", "panic", "the git development community",
  // Nadace a open-source projekty
  "mozilla", "mozilla foundation", "mozilla corporation", "blender foundation", "the document foundation",
  "python software foundation", "apache software foundation", "the apache software foundation", "openjs foundation",
  "node js foundation", "linux foundation", "eclipse foundation", "free software foundation", "gnu project",
  "kde", "gnome foundation", "videolan", "obs project", "audacity team", "muse group", "the gimp team", "gimp",
  "inkscape", "inkscape project", "krita foundation", "wireshark foundation", "the wireshark developer community",
  "postgresql global development group", "the tor project", "tor project", "signal messenger", "rust foundation",
  "the rust project developers", "golang", "the go authors", "kubernetes", "cncf", "adoptium", "eclipse adoptium",
  "the qt company", "openssl", "git for windows",
  // Komunikace, zábava a hry
  "valve", "discord", "spotify", "telegram fz", "telegram messenger", "whatsapp", "electronic arts", "ubisoft",
  "blizzard entertainment", "riot games", "gog", "gog sp z o o", "plex", "netflix", "steam", "ea app",
  // Prohlížeče a bezpečnost
  "brave software", "opera software", "opera norway", "vivaldi technologies", "proton", "bitwarden", "1password",
  "agilebits", "keepassxc team", "malwarebytes", "eset", "avast software", "kaspersky", "bitdefender", "yubico",
  "teamviewer", "anydesk software", "realvnc",
  // Známé nástroje pro Windows
  "sysinternals", "mark russinovich", "igor pavlov", "notepad++ team", "don ho", "voidtools", "dominik reichl",
  "simon tatham", "irfan skiljan", "nirsoft", "nir sofer", "piriform", "ccleaner", "rarlab", "alexander roshal",
  "win rar", "cpuid", "techpowerup", "crystal dew world", "pete batard", "akeo consulting", "sharex team",
  "greenshot", "paint net", "dotpdn", "the sumatrapdf project", "krzysztof kowalczyk", "foxit software",
  "tracker software products", "pdf xchange", "tablacus", "files community", "powertoys",
]);

/** Právní formy a zbytky interpunkce, které se při porovnání vynechají. */
const LEGAL_FORMS =
  /\b(incorporated|inc|llc|ltd|limited|corporation|corp|co|company|gmbh|ag|sa|bv|b v|nv|s r o|sro|spol|pty|plc|ab|oy|as|e v|ev|kg|srl|spa|sas|kk)\b/g;

/** Vydavatel v podobě pro porovnání se seznamem. */
export function publisherKey(publisher: string): string {
  return publisher
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,()"'’]/g, " ")
    .replace(/-/g, " ")
    .replace(LEGAL_FORMS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Je vydavatel na seznamu oficiálních? */
export function isOfficialPublisher(publisher: string | null | undefined): boolean {
  return !!publisher && OFFICIAL_PUBLISHERS.has(publisherKey(publisher));
}

const verifiedCache = new WeakMap<PublisherInfo, boolean>();

/** Ověřená oficiální aplikace: příznak z katalogu, jinak podle vydavatele. */
export function isVerified(entry: PublisherInfo): boolean {
  let value = verifiedCache.get(entry);
  if (value === undefined) {
    value = entry.verified ?? isOfficialPublisher(entry.publisher);
    verifiedCache.set(entry, value);
  }
  return value;
}
