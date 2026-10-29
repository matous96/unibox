/**
 * Redakční obsah sekce „Dnes“ na úvodní stránce: ručně psané příběhy
 * o aplikacích a tematické kolekce. Denní výběr (lib/today.ts) je střídá
 * s tipy na známé aplikace a výběry z kategorií z celého katalogu.
 *
 * Později může obsah dodávat server nebo data pipeline (stories.json);
 * struktura je proto čistě datová a texty jsou lokalizované.
 */

/** Text ve všech podporovaných jazycích (chybějící jazyk → čeština). */
export type Localized = { cs: string; en?: string };

/** Příběh o jedné aplikaci (velká karta s grafikou a lištou „Zobrazit“). */
export interface AppStory {
  kind: "app";
  id: string;
  appId: string;
  eyebrow: Localized;
  title: Localized;
  subtitle: Localized;
}

/** Tematická kolekce aplikací s možností „Instalovat vše“. */
export interface CollectionStory {
  kind: "collection";
  id: string;
  eyebrow: Localized;
  title: Localized;
  subtitle: Localized;
  /** Delší popis v detailu kolekce (modální okno). */
  description?: Localized;
  appIds: string[];
  /** Barva pozadí karty (hex). */
  color: string;
}

export const APP_STORIES: AppStory[] = [
  {
    kind: "app",
    id: "obsidian-tips",
    appId: "obsidian-obsidian",
    eyebrow: { cs: "Vyzkoušejte nyní", en: "Try it now" },
    title: { cs: "5 tipů, jak vytěžit maximum z Obsidianu", en: "5 tips to get the most out of Obsidian" },
    subtitle: { cs: "Propojte své poznámky do vlastní sítě znalostí.", en: "Link your notes into your own knowledge web." },
  },
  {
    kind: "app",
    id: "blender-studio",
    appId: "blenderfoundation-blender",
    eyebrow: { cs: "Pro tvůrce", en: "For creators" },
    title: { cs: "Blender: celé 3D studio zdarma", en: "Blender: a full 3D studio for free" },
    subtitle: { cs: "Modelujte, animujte a renderujte bez jediné koruny.", en: "Model, animate and render without spending a cent." },
  },
  {
    kind: "app",
    id: "powertoys-gems",
    appId: "microsoft-powertoys",
    eyebrow: { cs: "Skryté poklady", en: "Hidden gems" },
    title: { cs: "PowerToys: Windows, jak je neznáte", en: "PowerToys: Windows like you've never seen it" },
    subtitle: {
      cs: "FancyZones, PowerRename a další vychytávky přímo od Microsoftu.",
      en: "FancyZones, PowerRename and more tricks straight from Microsoft.",
    },
  },
  {
    kind: "app",
    id: "obs-first-stream",
    appId: "obsproject-obsstudio",
    eyebrow: { cs: "Začněte streamovat", en: "Start streaming" },
    title: { cs: "Váš první stream s OBS Studiem", en: "Your first stream with OBS Studio" },
    subtitle: {
      cs: "Scény, zdroje a nastavení, se kterými zvládnete začít ještě dnes.",
      en: "Scenes, sources and settings to get you live today.",
    },
  },
];

export const COLLECTIONS: CollectionStory[] = [
  {
    kind: "collection",
    id: "new-pc",
    eyebrow: { cs: "Základní výbava", en: "Essentials" },
    title: { cs: "Nový počítač? Tohle nainstalujte jako první", en: "New PC? Install these first" },
    subtitle: {
      cs: "Prohlížeč, archivátor, přehrávač a další nezbytnosti jedním kliknutím.",
      en: "Browser, archiver, player and more essentials in one click.",
    },
    description: {
      cs: "Čerstvý Windows umí spoustu věcí, ale pár aplikací chybí skoro každému. Firefox pro bezpečné prohlížení, 7-Zip na archivy, VLC na všechna videa, Notepad++ na rychlé úpravy textu a PowerToys s Everything, které z Windows udělají rychlejší a šikovnější systém.",
      en: "A fresh Windows does a lot, but almost everyone misses a few apps. Firefox for safe browsing, 7-Zip for archives, VLC for every video, Notepad++ for quick text edits, and PowerToys with Everything to make Windows faster and smarter.",
    },
    appIds: [
      "mozilla-firefox",
      "7zip-7zip",
      "videolan-vlc",
      "notepadplusplus-notepadplusplus",
      "microsoft-powertoys",
      "voidtools-everything",
    ],
    color: "#0f766e",
  },
  {
    kind: "collection",
    id: "focus",
    eyebrow: { cs: "Triky do práce", en: "Work smarter" },
    title: { cs: "Pracovní den bez rozptylování", en: "A workday without distractions" },
    subtitle: { cs: "Mějte úkoly, poznámky i hesla pod kontrolou.", en: "Keep tasks, notes and passwords under control." },
    description: {
      cs: "Plánujte v Notionu, propojujte myšlenky v Obsidianu a domlouvejte se se svým týmem ve Slacku. Bitwarden si zapamatuje všechna hesla, PowerToys a Everything ušetří spoustu kliknutí – soustředit se pak můžete na práci, ne na hledání.",
      en: "Plan in Notion, connect ideas in Obsidian and talk with your team in Slack. Bitwarden remembers every password, while PowerToys and Everything save you countless clicks – so you can focus on work, not on searching.",
    },
    appIds: [
      "notion-notion",
      "obsidian-obsidian",
      "slacktechnologies-slack",
      "bitwarden-bitwarden",
      "microsoft-powertoys",
      "voidtools-everything",
    ],
    color: "#15803d",
  },
  {
    kind: "collection",
    id: "dev-setup",
    eyebrow: { cs: "Pro vývojáře", en: "For developers" },
    title: { cs: "Vývojářský setup za pět minut", en: "A developer setup in five minutes" },
    subtitle: {
      cs: "Editor, Git, Node.js, Python a terminál – vše, co potřebujete ke kódování.",
      en: "Editor, Git, Node.js, Python and a terminal – everything you need to code.",
    },
    description: {
      cs: "Nový počítač připravený na vývoj bez hodin klikání: Visual Studio Code jako editor, Git na verze, Node.js a Python jako běhová prostředí, moderní Windows Terminal a Docker pro kontejnery. Všechno z oficiálních zdrojů a jedním tlačítkem.",
      en: "A new PC ready for development without hours of clicking: Visual Studio Code as the editor, Git for versions, Node.js and Python as runtimes, the modern Windows Terminal and Docker for containers. All from official sources with one button.",
    },
    appIds: [
      "microsoft-visualstudiocode",
      "git-git",
      "openjs-nodejs-lts",
      "python-python-3-13",
      "microsoft-windowsterminal",
      "docker-dockerdesktop",
    ],
    color: "#4338ca",
  },
];

/**
 * Kolekce podle zaměření – stálá nabídka na domovské stránce (na rozdíl od
 * denně střídaných kolekcí výše). `developer` = kolekce pro vývojáře.
 */
export const PROFILE_COLLECTIONS: (CollectionStory & { developer?: boolean })[] = [
  {
    kind: "collection",
    id: "profile-gaming",
    eyebrow: { cs: "Pro hráče", en: "For gamers" },
    title: { cs: "Hráčský PC", en: "Gaming PC" },
    subtitle: { cs: "Herní obchody, chat, streamování a ladění grafiky.", en: "Game stores, chat, streaming and GPU tuning." },
    description: {
      cs: "Steam, Epic Games a GOG Galaxy pohromadě, Discord na hraní s přáteli, OBS Studio na nahrávání a streamování a MSI Afterburner, který ukáže snímky za sekundu a pomůže vyladit grafickou kartu.",
      en: "Steam, Epic Games and GOG Galaxy together, Discord to play with friends, OBS Studio for recording and streaming, and MSI Afterburner to show frame rates and tune your graphics card.",
    },
    appIds: ["valve-steam", "discord-discord", "obsproject-obsstudio", "guru3d-afterburner", "epicgames-epicgameslauncher", "gog-galaxy"],
    color: "#6d28d9",
  },
  {
    kind: "collection",
    id: "profile-creative",
    eyebrow: { cs: "Pro kreativce", en: "For creators" },
    title: { cs: "Grafik a kreativec", en: "Designer & creator" },
    subtitle: { cs: "Design, 3D, vektory a úprava fotek.", en: "Design, 3D, vectors and photo editing." },
    description: {
      cs: "Navrhujte rozhraní ve Figmě, modelujte a animujte v Blenderu, kreslete vektory v Inkscapu a upravujte fotky v GIMPu. ShareX k tomu přidá rychlé snímky a nahrávání obrazovky – profesionální nástroje bez předplatného.",
      en: "Design interfaces in Figma, model and animate in Blender, draw vectors in Inkscape and edit photos in GIMP. ShareX adds quick screenshots and screen recording – professional tools with no subscription.",
    },
    appIds: ["figma-figma", "blenderfoundation-blender", "inkscape-inkscape", "gimp-gimp-3", "sharex-sharex"],
    color: "#be185d",
  },
  {
    kind: "collection",
    id: "profile-essentials",
    eyebrow: { cs: "Pro každého", en: "For everyone" },
    title: { cs: "Základní výbava pro nový počítač", en: "New PC essentials" },
    subtitle: { cs: "Archivátor, přehrávač, prohlížeč a vychytávky Windows.", en: "Archiver, player, browser and Windows power tools." },
    description: {
      cs: "To nejdůležitější pro každý počítač: 7-Zip rozbalí jakýkoli archiv, VLC přehraje každé video, Firefox bezpečně prohlíží web a PowerToys s Everything zrychlí práci s okny i hledání souborů.",
      en: "The essentials for any PC: 7-Zip opens any archive, VLC plays every video, Firefox browses the web safely, and PowerToys with Everything speed up window management and file search.",
    },
    appIds: ["7zip-7zip", "videolan-vlc", "mozilla-firefox", "microsoft-powertoys", "voidtools-everything"],
    color: "#0f766e",
  },
  {
    kind: "collection",
    id: "profile-study",
    eyebrow: { cs: "Pro studenty", en: "For students" },
    title: { cs: "Škola a kancelář", en: "School & office" },
    subtitle: { cs: "Dokumenty, poznámky, výuka online a hesla.", en: "Documents, notes, online classes and passwords." },
    description: {
      cs: "LibreOffice na dokumenty, tabulky i prezentace zdarma, Obsidian a Notion na poznámky a projekty, Zoom na výuku online a Bitwarden, aby žádné heslo nezůstalo na papírku.",
      en: "LibreOffice for documents, spreadsheets and presentations for free, Obsidian and Notion for notes and projects, Zoom for online classes, and Bitwarden so no password ends up on a sticky note.",
    },
    appIds: ["thedocumentfoundation-libreoffice", "obsidian-obsidian", "zoom-zoom", "notion-notion", "bitwarden-bitwarden"],
    color: "#1d4ed8",
  },
  {
    kind: "collection",
    id: "profile-developer",
    eyebrow: { cs: "Pro vývojáře", en: "For developers" },
    title: { cs: "Vývojář", en: "Developer" },
    subtitle: { cs: "Editor, Git, běhová prostředí, terminál a nástroje.", en: "Editor, Git, runtimes, terminal and tools." },
    description: {
      cs: "Základ pro každodenní vývoj: Visual Studio Code, Git, Node.js a Python, Windows Terminal a k tomu rychlí správci balíčků pnpm a uv. Další nástroje najdete v sekci Pro vývojáře.",
      en: "The basics for everyday development: Visual Studio Code, Git, Node.js and Python, Windows Terminal, plus the fast package managers pnpm and uv. More tools are in the For developers section.",
    },
    appIds: ["microsoft-visualstudiocode", "git-git", "openjs-nodejs-lts", "python-python-3-13", "microsoft-windowsterminal", "pnpm-pnpm", "astral-sh-uv"],
    color: "#4338ca",
    developer: true,
  },
];

/** Číslo dne od 1. 1. 1970 (místní čas) – podle něj se obsah denně střídá (lib/today.ts). */
export function dayIndex(date = new Date()): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** Text v požadovaném jazyce – redakční texty jsou česky a anglicky, ostatní jazyky dostanou angličtinu. */
export const localize = (text: Localized, language: string) => (language === "cs" ? text.cs : (text.en ?? text.cs));
