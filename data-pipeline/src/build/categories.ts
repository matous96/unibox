/**
 * Zařazení aplikace do kategorií podle štítků (winget, Chocolatey), názvu
 * a popisu. Každé klíčové slovo přidá kategorii body; aplikace dostane
 * nejvýš dvě kategorie s nejvyšším skóre.
 */
import type { CategoryId } from "../../../src/types/index.ts";
import { normalize } from "../lib/text.ts";

/** Klíčová slova → kategorie (štítky mají váhu 2, slova z názvu a popisu 1). */
const KEYWORDS: Record<CategoryId, string[]> = {
  browsers: ["browser", "web-browser", "webbrowser", "chromium", "firefox", "chrome"],
  development: [
    "development", "developer", "developer-tools", "devtools", "ide", "code-editor", "programming", "compiler", "sdk",
    "git", "version-control", "vcs", "debugger", "database", "api", "javascript", "python", "nodejs", "rust", "java",
    "dotnet", "docker", "container", "kubernetes", "terminal", "shell", "cli", "command-line", "devops", "json",
  ],
  communication: ["chat", "messaging", "messenger", "email", "e-mail", "mail", "voip", "video-conferencing", "meeting", "irc", "slack", "discord", "telegram"],
  games: ["game", "games", "gaming", "launcher", "steam", "emulator", "minecraft", "esports"],
  multimedia: ["media", "video", "audio", "music", "player", "media-player", "streaming", "podcast", "recording", "codec", "youtube", "mp3", "dvd"],
  utilities: ["utility", "utilities", "tool", "tools", "file-manager", "archive", "archiver", "zip", "7z", "rar", "clipboard", "screenshot", "search", "launcher", "rename"],
  security: ["security", "password", "password-manager", "vpn", "antivirus", "anti-malware", "malware", "encryption", "privacy", "firewall", "2fa", "authenticator"],
  productivity: ["office", "productivity", "notes", "note-taking", "pdf", "todo", "calendar", "document", "spreadsheet", "markdown", "writing", "ebook", "reader"],
  graphics: ["graphics", "image", "image-editor", "photo", "photography", "drawing", "paint", "3d", "design", "svg", "vector", "cad", "animation", "icon"],
  system: ["system", "hardware", "monitoring", "driver", "drivers", "disk", "benchmark", "backup", "cleanup", "registry", "uninstaller", "cpu", "gpu", "partition", "boot", "usb"],
};

/** Opačná mapa slovo → kategorie. */
const BY_WORD = new Map<string, CategoryId[]>();
for (const [category, words] of Object.entries(KEYWORDS) as [CategoryId, string[]][]) {
  for (const word of words) BY_WORD.set(word, [...(BY_WORD.get(word) ?? []), category]);
}

export function categorize(tags: string[], name: string, description: string): CategoryId[] {
  const score = new Map<CategoryId, number>();
  const add = (word: string, weight: number) => {
    for (const c of BY_WORD.get(word) ?? []) score.set(c, (score.get(c) ?? 0) + weight);
  };
  for (const tag of tags) add(normalize(tag), 2);
  for (const word of normalize(`${name} ${description}`).split(/[^a-z0-9+#-]+/)) if (word) add(word, 1);

  return [...score.entries()]
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c]) => c);
}
