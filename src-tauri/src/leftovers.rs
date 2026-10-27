//! Zbytky po odinstalaci.
//!
//! Po úspěšné odinstalaci se hledají složky aplikace v `%APPDATA%`,
//! `%LOCALAPPDATA%` a `%LOCALAPPDATA%\Programs`, které odinstalátor nechal
//! (nastavení, mezipaměti, profily). Pokročilá odinstalace (Nastavení,
//! výchozí vypnuto – styl Revo Uninstaller) hledá navíc:
//!  - složky v Program Files (64 i 32 bit) a ProgramData,
//!  - zástupce v nabídce Start a na ploše (uživatele i všech uživatelů),
//!  - klíče registru `HKCU\Software`, `HKLM\SOFTWARE` (i 32bit `WOW6432Node`)
//!    pojmenované jako aplikace, i pod klíčem vydavatele (`Mozilla\Firefox`),
//!  - záznam „Programy a funkce“, který po odinstalaci zůstal (pozůstatek).
//!
//! Hledá se jen podle názvu aplikace a id balíčku – složka / klíč musí mít
//! název aplikace (`Discord`, `Mozilla Firefox`), nebo být podsložkou
//! vydavatele (`Google\Chrome`). Nikdy se nenabídne:
//!  - složka, na kterou dál odkazuje některý nainstalovaný program (registr
//!    Uninstall – třeba `Programs\Python` s jinou verzí Pythonu), ani složka či
//!    klíč se jménem jiného nainstalovaného programu,
//!  - systémové a sdílené složky a klíče (Microsoft, Classes, Policies, Temp…),
//!  - nic jiného než položky z posledního hledání (frontend nemůže nechat
//!    smazat libovolnou cestu).
//!
//! Mazání: soubory a složky jdou do Koše (obnovitelné); klíče registru se
//! nejdřív zálohují (`reg export` do složky aplikace – obnova dvojklikem)
//! a pak smažou. Co vyžaduje práva správce (Program Files, ProgramData, HKLM),
//! smaže povýšený pomocník Uniboxu po jednom potvrzení UAC – každou položku
//! si znovu ověří stejnými pravidly ([`allowed`]).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::arp;
use crate::process::{hidden_command, system_tool};

/// Parametr, se kterým se Unibox spouští jako povýšený pomocník úklidu zbytků.
pub const ELEVATED_CLEANUP_FLAG: &str = "--unibox-elevated-cleanup";

/// Druh zbytku.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Folder,
    File,
    Registry,
    /// Hodnota v klíči Run (spuštění po přihlášení) – cesta „HKCU\…\Run|název“.
    /// Najde ji jen záznam instalace (tracker.rs).
    Value,
}

/// Nalezený zbytek: cesta (u registru klíč „HKCU\Software\…“), velikost,
/// počet souborů (u registru hodnot) a jestli smazání vyžaduje práva správce.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Leftover {
    pub path: String,
    pub kind: Kind,
    pub size: u64,
    pub files: u64,
    pub admin: bool,
}

/// Položka pro smazání (i v zadání pro povýšeného pomocníka).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Item {
    pub kind: Kind,
    pub path: String,
}

/// Výsledek mazání.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Removal {
    removed: Vec<String>,
    failed: Vec<String>,
    /// Položky, které vyžadují práva správce a nesmazaly se (povýšení zakázané nebo UAC odmítnut).
    needs_admin: Vec<String>,
    /// Složka se zálohou smazaných klíčů registru.
    backup: Option<String>,
}

/// Položky nabídnuté posledním hledáním – jen ty jde smazat.
static OFFERED: Mutex<Option<HashMap<String, Leftover>>> = Mutex::new(None);

/// Názvy (klíče názvu) složek a klíčů registru, které se nenabízejí nikdy –
/// sdílené více aplikacemi nebo systémové – a obecná slova, která nejsou
/// názvem aplikace (zbytek po odtržení vydavatele: „NVIDIA App“ → „app“).
const PROTECTED: &[&str] = &[
    "microsoft", "packages", "temp", "programs", "windows", "crashdumps", "connecteddevicesplatform", "comms",
    "d3dscache", "unibox", "orguniboxapp", "orguniboxdev", "common", "cache", "google", "mozilla", "apple",
    "classes", "policies", "clients", "wow6432node", "registeredapplications", "odbc", "intel", "nvidia",
    "nvidiacorporation", "realtek", "amd", "khronos", "commonfiles", "windowsapps", "packagecache", "startmenu",
    "desktop", "documents", "default", "public", "system", "software", "appdata", "programdata", "programfiles",
    // Obecná slova
    "app", "apps", "application", "applications", "client", "launcher", "studio", "player", "helper", "service",
    "services", "tool", "tools", "update", "updater", "setup", "installer", "bin", "data", "files", "plugin",
    "plugins", "user", "users", "local", "locallow", "roaming", "program", "beta", "free", "pro", "lite",
    "portable", "runtime", "driver", "drivers", "sdk", "web", "browser", "editor", "manager", "office", "home",
    "main", "core", "shared", "lib", "resources", "assets", "config", "settings", "logs", "log", "tmp", "current",
    "latest", "stable",
];

pub(crate) fn protected(key: &str) -> bool {
    key.is_empty() || PROTECTED.contains(&key)
}

// ── Kořeny hledání ───────────────────────────────────────────────────────

/// Kořen, ve kterém se zbytky hledají: složka a jestli mazání v ní vyžaduje
/// práva správce; `shortcuts` = jen zástupci a jejich složky (nabídka Start, plocha).
pub(crate) struct Root {
    pub dir: PathBuf,
    pub admin: bool,
    pub shortcuts: bool,
}

fn env_dir(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).map(PathBuf::from)
}

/// Kořeny pro složky a zástupce. Bez `deep` jen AppData (základní hledání).
pub(crate) fn roots(deep: bool) -> Vec<Root> {
    let user = |dir: Option<PathBuf>| dir.map(|dir| Root { dir, admin: false, shortcuts: false });
    let local = env_dir("LOCALAPPDATA");
    let mut roots: Vec<Root> = [user(env_dir("APPDATA")), user(local.clone()), user(local.map(|l| l.join("Programs")))]
        .into_iter()
        .flatten()
        .collect();
    if deep {
        let machine = |dir: Option<PathBuf>, shortcuts: bool| dir.map(|dir| Root { dir, admin: true, shortcuts });
        let start_menu = r"Microsoft\Windows\Start Menu\Programs";
        roots.extend(
            [
                machine(env_dir("ProgramW6432").or_else(|| env_dir("ProgramFiles")), false),
                machine(env_dir("ProgramFiles(x86)"), false),
                machine(env_dir("ProgramData"), false),
                machine(env_dir("ProgramData").map(|d| d.join(start_menu)), true),
                machine(env_dir("PUBLIC").map(|d| d.join("Desktop")), true),
                env_dir("APPDATA").map(|d| Root { dir: d.join(start_menu), admin: false, shortcuts: true }),
                env_dir("USERPROFILE").map(|d| Root { dir: d.join("Desktop"), admin: false, shortcuts: true }),
            ]
            .into_iter()
            .flatten(),
        );
    }
    roots
}

/// Klíče registru, ve kterých se hledá: kořen jako text a jestli mazání vyžaduje práva správce.
pub(crate) const REGISTRY_ROOTS: &[(&str, bool)] = &[(r"HKCU\Software", false), (r"HKLM\SOFTWARE", true), (r"HKLM\SOFTWARE\WOW6432Node", true)];

/// Klíče Run (spuštění po přihlášení) – jediné, ze kterých jde smazat hodnotu (záznam instalace).
pub(crate) const RUN_KEYS: &[(&str, bool)] = &[
    (r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", false),
    (r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true),
    (r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", true),
];

/// Klíče se záznamy „Programy a funkce“.
pub(crate) const UNINSTALL_KEYS: &[(&str, bool)] = &[
    (r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall", false),
    (r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", true),
    (r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", true),
];

/// Hodnota v klíči Run: „HKCU\…\Run|Discord“ → (klíč, název hodnoty).
pub(crate) fn split_value(path: &str) -> Option<(&str, &str)> {
    let (key, value) = path.rsplit_once('|')?;
    (!value.is_empty()).then_some((key, value))
}

// ── Hledání ──────────────────────────────────────────────────────────────

/// Výsledek hledání. `still_installed` = aplikace (jiná kopie, verze, nebo
/// odinstalátor ještě nedoběhl a záznam v registru trvá) je pořád nainstalovaná –
/// pak se nenabídne nic a frontend to za chvíli zkusí znovu.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan {
    items: Vec<Leftover>,
    still_installed: bool,
    /// Kolik položek přidal záznam instalace (tracker.rs).
    traced: usize,
}

/// Hledá zbytky aplikace; `trace_key` („zdroj:id balíčku“) přidá i položky ze
/// záznamu instalace, které ještě existují – nezávisle na pokročilé odinstalaci.
#[tauri::command]
pub async fn leftover_scan(app: AppHandle, name: String, package_id: String, deep: bool, trace_key: Option<String>) -> Result<Scan, String> {
    let traces = crate::tracker::traces_dir(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let registry = arp::Registry::load();
        let installed = Installed::load(&registry);
        if installed.blocks(&arp::name_key(&name)) {
            return Scan { items: Vec::new(), still_installed: true, traced: 0 };
        }
        let mut found = scan_folders(&roots(deep), &name, &package_id, &installed);
        if deep {
            found.extend(scan_registry(&name, &package_id, &installed));
            found.extend(leftover_entries(&registry, &name, &package_id));
        }
        let mut traced = 0;
        if let (Some(dir), Some(key)) = (traces, trace_key) {
            for item in traced_leftovers(&crate::tracker::remaining_items(&dir, &key), &installed) {
                if !found.iter().any(|l| l.path.eq_ignore_ascii_case(&item.path)) {
                    found.push(item);
                    traced += 1;
                }
            }
        }
        let mut offered = OFFERED.lock().unwrap_or_else(|e| e.into_inner());
        offered.get_or_insert_with(HashMap::new).extend(found.iter().map(|l| (l.path.clone(), l.clone())));
        Scan { items: found, still_installed: false, traced }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Položky záznamu instalace, které jde smazat: existují, projdou pravidly
/// [`allowed`] a nepatří nainstalovanému programu.
fn traced_leftovers(items: &[Item], installed: &Installed) -> Vec<Leftover> {
    items
        .iter()
        .filter(|item| allowed(item) && exists(item))
        .filter(|item| match item.kind {
            Kind::Folder | Kind::File => !installed.owns(Path::new(&item.path)),
            Kind::Registry => !installed.blocks(&arp::name_key(item.path.rsplit('\\').next().unwrap_or(""))),
            Kind::Value => true,
        })
        .map(|item| {
            let admin = item.path.starts_with("HKLM") || roots(true).iter().any(|r| r.admin && starts_with_dir(&item.path, &r.dir));
            let (size, files) = match item.kind {
                Kind::Folder => measure(Path::new(&item.path)),
                Kind::File => (Path::new(&item.path).metadata().map(|m| m.len()).unwrap_or(0), 1),
                Kind::Registry => (0, registry::value_count(&item.path)),
                Kind::Value => (0, 1),
            };
            Leftover { path: item.path.clone(), kind: item.kind, size, files, admin }
        })
        .collect()
}

/// Leží cesta ve složce `dir` (bez ohledu na velikost písmen)?
fn starts_with_dir(path: &str, dir: &Path) -> bool {
    path.to_lowercase().starts_with(&format!("{}\\", dir.to_string_lossy().to_lowercase().trim_end_matches('\\')))
}

/// Co patří nainstalovaným programům: cesty, na které odkazují (malými
/// písmeny), a klíče jejich názvů (pozůstatky po odinstalaci se nepočítají).
struct Installed {
    paths: Vec<String>,
    names: HashSet<String>,
}

impl Installed {
    fn load(registry: &arp::Registry) -> Self {
        let entries = registry.installed();
        Installed {
            paths: entries.iter().flat_map(|e| arp::referenced_paths(e)).map(|p| p.to_string_lossy().to_lowercase()).collect(),
            names: entries.iter().map(|e| arp::name_key(&e.name)).collect(),
        }
    }

    #[cfg(test)]
    fn none() -> Self {
        Installed { paths: Vec::new(), names: HashSet::new() }
    }

    /// Patří název nainstalovanému programu? Stejný klíč, nebo (u delších
    /// názvů) část názvu nainstalovaného programu – „firefox“ zůstane, dokud je
    /// nainstalovaný Firefox Developer Edition (sdílí s ním profil).
    fn blocks(&self, key: &str) -> bool {
        self.names.contains(key) || (key.len() >= 5 && self.names.iter().any(|name| name.contains(key)))
    }

    /// Patří složka či zástupce nainstalovanému programu (odkazuje na ni nebo do ní, nebo má jeho jméno)?
    fn owns(&self, path: &Path) -> bool {
        let lower = path.to_string_lossy().to_lowercase();
        let prefix = format!("{}\\", lower.trim_end_matches('\\'));
        let key = if is_shortcut(path) { file_key(path) } else { folder_key(path) };
        self.blocks(&key) || self.paths.iter().any(|p| p.starts_with(&prefix) || p.trim_end_matches('\\') == prefix.trim_end_matches('\\'))
    }
}

/// Klíče názvu aplikace a vydavatele z názvu a id balíčku:
/// „Mozilla Firefox“ + „Mozilla.Firefox“ → aplikace {mozillafirefox, firefox}, vydavatel mozilla;
/// „Discord“ + „ARP\User\X64\Discord“ → aplikace {discord}.
pub(crate) fn name_keys(name: &str, package_id: &str) -> (HashSet<String>, Option<String>) {
    let mut apps = HashSet::new();
    apps.insert(arp::name_key(name));
    let mut publisher = None;

    let parts: Vec<&str> = package_id.split('\\').collect();
    if parts.len() == 4 && parts[0].eq_ignore_ascii_case("ARP") {
        // Záznam z registru – klíč bývá název programu, ale i GUID
        if !parts[3].starts_with('{') {
            apps.insert(arp::name_key(parts[3]));
        }
    } else if package_id.contains('.') && !package_id.contains('\\') {
        // winget: Vydavatel.Aplikace[.Varianta]
        let segments: Vec<&str> = package_id.split('.').collect();
        publisher = Some(arp::name_key(segments[0]));
        apps.insert(arp::name_key(segments[1]));
        apps.insert(arp::name_key(&segments[1..].join(" ")));
    }
    // „Mozilla Firefox“ bez vydavatele na začátku = „Firefox“
    if let Some(p) = &publisher {
        let key = arp::name_key(name);
        if let Some(rest) = key.strip_prefix(p.as_str()) {
            apps.insert(rest.to_string());
        }
    }
    apps.retain(|k| k.len() >= 3 && !protected(k));
    (apps, publisher.filter(|p| p.len() >= 2))
}

/// Najde složky (a v kořenech se zástupci i soubory .lnk / .url) aplikace.
fn scan_folders(roots: &[Root], name: &str, package_id: &str, installed: &Installed) -> Vec<Leftover> {
    let (apps, publisher) = name_keys(name, package_id);
    if apps.is_empty() {
        return Vec::new();
    }
    let mut found: Vec<(PathBuf, bool)> = Vec::new();
    for root in roots {
        let mut consider = |path: PathBuf| {
            if !found.iter().any(|(known, _)| known == &path) {
                found.push((path, root.admin));
            }
        };
        for dir in subdirectories(&root.dir) {
            let key = folder_key(&dir);
            if apps.contains(&key) {
                consider(dir);
            } else if publisher.as_deref() == Some(key.as_str()) {
                // Podsložka vydavatele: Google\Chrome, Mozilla\Firefox
                subdirectories(&dir).into_iter().filter(|sub| apps.contains(&folder_key(sub))).for_each(&mut consider);
            }
        }
        if root.shortcuts {
            shortcuts(&root.dir).into_iter().filter(|file| apps.contains(&file_key(file))).for_each(&mut consider);
        }
    }
    found
        .into_iter()
        // Složka, kterou dál používá nainstalovaný program, není zbytek
        .filter(|(path, _)| !installed.owns(path))
        .map(|(path, admin)| {
            let kind = if path.is_dir() { Kind::Folder } else { Kind::File };
            let (size, files) = if kind == Kind::Folder { measure(&path) } else { (path.metadata().map(|m| m.len()).unwrap_or(0), 1) };
            Leftover { path: path.to_string_lossy().into_owned(), kind, size, files, admin }
        })
        .collect()
}

pub(crate) fn folder_key(dir: &Path) -> String {
    dir.file_name().map(|n| arp::name_key(&n.to_string_lossy())).unwrap_or_default()
}

/// Klíč názvu souboru bez přípony („OBS Studio (64bit).lnk“ → „obsstudio“).
fn file_key(file: &Path) -> String {
    file.file_stem().map(|n| arp::name_key(&n.to_string_lossy())).unwrap_or_default()
}

/// Podsložky (bez odkazů – junction / symlink nevedou ke zbytkům aplikace).
pub(crate) fn subdirectories(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink()))
        .map(|e| e.path())
        .collect()
}

/// Zástupci (.lnk, .url) přímo ve složce.
pub(crate) fn shortcuts(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .map(|e| e.path())
        .filter(|p| is_shortcut(p))
        .collect()
}

fn is_shortcut(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("lnk") || ext.eq_ignore_ascii_case("url"))
}

/// Velikost a počet souborů (u obřích složek jen odhad – nejvýš 2 s / 200 000 souborů).
fn measure(dir: &Path) -> (u64, u64) {
    let started = Instant::now();
    let (mut size, mut files) = (0u64, 0u64);
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        if started.elapsed() > Duration::from_secs(2) || files > 200_000 {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&current) else { continue };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_symlink() {
                continue;
            } else if kind.is_dir() {
                stack.push(entry.path());
            } else {
                files += 1;
                size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    (size, files)
}

/// Klíče registru aplikace pod `HKCU\Software` a `HKLM\SOFTWARE` (i 32bit).
fn scan_registry(name: &str, package_id: &str, installed: &Installed) -> Vec<Leftover> {
    let (apps, publisher) = name_keys(name, package_id);
    if apps.is_empty() {
        return Vec::new();
    }
    let mut found = Vec::new();
    for (root, admin) in REGISTRY_ROOTS {
        for key in registry::subkeys(root) {
            let key_name = arp::name_key(&key);
            let path = format!(r"{root}\{key}");
            if apps.contains(&key_name) {
                found.push((path, *admin, key_name));
            } else if publisher.as_deref() == Some(key_name.as_str()) {
                for sub in registry::subkeys(&path) {
                    let sub_name = arp::name_key(&sub);
                    if apps.contains(&sub_name) {
                        found.push((format!(r"{path}\{sub}"), *admin, sub_name));
                    }
                }
            }
        }
    }
    found
        .into_iter()
        .filter(|(_, _, key)| !installed.blocks(key))
        .map(|(path, admin, _)| Leftover { files: registry::value_count(&path), path, kind: Kind::Registry, size: 0, admin })
        .collect()
}

/// Záznamy „Programy a funkce“ aplikace, které po odinstalaci zůstaly (spustitelný soubor chybí).
fn leftover_entries(registry: &arp::Registry, name: &str, package_id: &str) -> Vec<Leftover> {
    let (apps, _) = name_keys(name, package_id);
    registry
        .entries()
        .iter()
        .filter(|e| apps.contains(&arp::name_key(&e.name)) && arp::is_leftover(e))
        .map(|e| {
            let hive = if e.user { r"HKCU\Software" } else if e.x86 { r"HKLM\SOFTWARE\WOW6432Node" } else { r"HKLM\SOFTWARE" };
            let path = format!(r"{hive}\Microsoft\Windows\CurrentVersion\Uninstall\{}", e.key);
            Leftover { files: registry::value_count(&path), path, kind: Kind::Registry, size: 0, admin: !e.user }
        })
        .collect()
}

// ── Pravidla pro mazání ──────────────────────────────────────────────────

/// Smí se položka smazat? Kontrola nezávislá na hledání (povýšený pomocník
/// ji dělá znovu): složka nebo zástupce nejvýš o dvě úrovně pod některým
/// kořenem hledání (vydavatel\aplikace), bez odkazů a „..“; klíč registru
/// `Software\<aplikace>`, `Software\<vydavatel>\<aplikace>` nebo záznam Uninstall.
/// Chráněné názvy nikdy.
pub(crate) fn allowed(item: &Item) -> bool {
    match item.kind {
        Kind::Registry => registry_allowed(&item.path),
        Kind::Folder | Kind::File => path_allowed(item.kind, Path::new(&item.path)),
        // Jen hodnota přímo v jednom z klíčů Run
        Kind::Value => split_value(&item.path).is_some_and(|(key, _)| RUN_KEYS.iter().any(|(run, _)| run.eq_ignore_ascii_case(key))),
    }
}

fn path_allowed(kind: Kind, path: &Path) -> bool {
    if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
    }
    // Odkaz (junction / symlink) by vedl jinam
    if std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
        return false;
    }
    let lower = path.to_string_lossy().to_lowercase();
    // Nejdelší kořen, pod kterým položka leží
    let Some(root) = roots(true)
        .into_iter()
        .filter(|root| lower.starts_with(&format!("{}\\", root.dir.to_string_lossy().to_lowercase().trim_end_matches('\\'))))
        .max_by_key(|root| root.dir.as_os_str().len())
    else {
        return false;
    };
    let depth = path.components().count() - root.dir.components().count();
    let name_ok = match kind {
        Kind::File => root.shortcuts && is_shortcut(path) && !protected(&file_key(path)),
        _ => !protected(&folder_key(path)),
    };
    name_ok && (1..=2).contains(&depth)
}

fn registry_allowed(path: &str) -> bool {
    let parts: Vec<&str> = path.split('\\').collect();
    if parts.len() < 3 || !matches!(parts[0], "HKCU" | "HKLM") || !parts[1].eq_ignore_ascii_case("software") {
        return false;
    }
    let mut rest = &parts[2..];
    if parts[0] == "HKLM" && rest.first().is_some_and(|p| p.eq_ignore_ascii_case("wow6432node")) {
        rest = &rest[1..];
    }
    let uninstall = ["microsoft", "windows", "currentversion", "uninstall"];
    if rest.len() == 5 && rest[..4].iter().zip(uninstall).all(|(a, b)| a.eq_ignore_ascii_case(b)) {
        return !rest[4].is_empty();
    }
    // Software\<aplikace> nebo Software\<vydavatel>\<aplikace>
    let last = rest.last().map(|k| arp::name_key(k)).unwrap_or_default();
    (1..=2).contains(&rest.len()) && !protected(&last) && (rest.len() == 2 || !protected(&arp::name_key(rest[0])))
}

/// Existuje položka ještě?
pub(crate) fn exists(item: &Item) -> bool {
    match item.kind {
        Kind::Registry => registry::exists(&item.path),
        Kind::Value => split_value(&item.path).is_some_and(|(key, value)| registry::has_value(key, value)),
        _ => Path::new(&item.path).exists(),
    }
}

/// Smaže jednu položku (soubor / složka do Koše, klíč či hodnota registru natrvalo).
fn delete(item: &Item) -> Result<(), String> {
    if !allowed(item) {
        return Err("položku nejde smazat".into());
    }
    match item.kind {
        Kind::Registry => registry::delete(&item.path),
        Kind::Value => {
            let (key, value) = split_value(&item.path).ok_or("neplatná hodnota")?;
            registry::delete_value(key, value)?;
            // Stav zapnutí (Správce úloh) k hodnotě, která už není
            let approved = key.replace(r"CurrentVersion\Run", r"CurrentVersion\Explorer\StartupApproved\Run");
            let approved = if key.to_ascii_lowercase().contains("wow6432node") {
                approved.replace(r"SOFTWARE\WOW6432Node\", r"SOFTWARE\").replace(r"StartupApproved\Run", r"StartupApproved\Run32")
            } else {
                approved
            };
            let _ = registry::delete_value(&approved, value);
            Ok(())
        }
        _ => to_recycle_bin(Path::new(&item.path)),
    }
}

// ── Mazání ───────────────────────────────────────────────────────────────

/// Smaže vybrané zbytky z posledního hledání: soubory a složky do Koše, klíče
/// registru po záloze. Co vyžaduje práva správce a bez nich nešlo, smaže
/// s `elevate` povýšený pomocník (jedno potvrzení UAC).
#[tauri::command]
pub async fn remove_leftovers(app: AppHandle, paths: Vec<String>, app_name: String, elevate: bool) -> Result<Removal, String> {
    let mut result = Removal::default();
    let chosen: Vec<Leftover> = {
        let mut offered = OFFERED.lock().unwrap_or_else(|e| e.into_inner());
        let offered = offered.get_or_insert_with(HashMap::new);
        paths.iter().filter_map(|p| offered.remove(p)).collect()
    };
    result.failed.extend(paths.into_iter().filter(|p| !chosen.iter().any(|l| &l.path == p)));
    let backup_root = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("registry-backup");
    tauri::async_runtime::spawn_blocking(move || {
        // Co mezitím zmizelo (odinstalátor NSIS / MSI dokončil úklid sám až po hledání), je hotové
        let (chosen, gone): (Vec<Leftover>, Vec<Leftover>) =
            chosen.into_iter().partition(|l| exists(&Item { kind: l.kind, path: l.path.clone() }));
        result.removed.extend(gone.into_iter().map(|l| l.path));

        // Záloha klíčů a hodnot registru – bez zálohy se nesmažou
        let keys: Vec<&Leftover> = chosen.iter().filter(|l| matches!(l.kind, Kind::Registry | Kind::Value)).collect();
        let mut unbacked = HashSet::new();
        if !keys.is_empty() {
            let dir = backup_root.join(format!("{} {}", utc_stamp(), safe_file_name(&app_name)));
            match backup(&dir, &keys) {
                Ok(failed) => unbacked.extend(failed),
                Err(_) => unbacked.extend(keys.iter().map(|k| k.path.clone())),
            }
            if dir.exists() {
                result.backup = Some(dir.to_string_lossy().into_owned());
            }
        }

        let mut admin_needed = Vec::new();
        for leftover in &chosen {
            if unbacked.contains(&leftover.path) {
                result.failed.push(leftover.path.clone());
                continue;
            }
            let item = Item { kind: leftover.kind, path: leftover.path.clone() };
            if delete(&item).is_ok() && !exists(&item) {
                result.removed.push(item.path);
            } else if leftover.admin && exists(&item) {
                admin_needed.push(item);
            } else {
                result.failed.push(item.path);
            }
        }

        if !admin_needed.is_empty() {
            let attempted = elevate && elevated_delete(&admin_needed).unwrap_or(false);
            for item in admin_needed {
                if attempted && !exists(&item) {
                    result.removed.push(item.path);
                } else if attempted {
                    result.failed.push(item.path);
                } else {
                    result.needs_admin.push(item.path);
                }
            }
        }
        result
    })
    .await
    .map_err(|e| e.to_string())
}

/// Zazálohuje klíče registru (`reg export`, jeden soubor .reg na klíč; u hodnoty
/// celý klíč Run). Vrátí klíče, které zálohovat nešlo.
fn backup(dir: &Path, keys: &[&Leftover]) -> Result<Vec<String>, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut failed = Vec::new();
    for (n, key) in keys.iter().enumerate() {
        let file = dir.join(format!("{}.reg", n + 1));
        let export = if key.kind == Kind::Value { split_value(&key.path).map_or(key.path.as_str(), |(k, _)| k) } else { key.path.as_str() };
        let mut command = hidden_command(&system_tool("reg.exe").to_string_lossy());
        command.args(["export", export]).arg(&file).arg("/y");
        let ok = crate::process::run(command, Duration::from_secs(30)).is_ok_and(|out| out.code == 0) && file.exists();
        if !ok {
            failed.push(key.path.clone());
        }
    }
    Ok(failed)
}

/// Povýšený pomocník smaže položky; false = nespuštěn (UAC odmítnut, povýšení zakázané).
fn elevated_delete(items: &[Item]) -> Result<bool, String> {
    let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(items).map_err(|e| e.to_string())?);
    Ok(crate::elevation::run_self_elevated(ELEVATED_CLEANUP_FLAG, &payload)?.is_some())
}

/// Vstupní bod povýšeného pomocníka (`unibox.exe --unibox-elevated-cleanup …`):
/// smaže položky, které projdou kontrolou [`allowed`]. Vrátí počet nesmazaných.
pub fn elevated_cleanup_main(payload: &str) -> i32 {
    let Some(items) = URL_SAFE_NO_PAD.decode(payload).ok().and_then(|bytes| serde_json::from_slice::<Vec<Item>>(&bytes).ok()) else {
        return -1;
    };
    items.iter().filter(|item| delete(item).is_err()).count() as i32
}

/// Název souboru bez znaků, které Windows nepovolí.
pub(crate) fn safe_file_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { '_' } else { c }).collect();
    cleaned.trim().trim_end_matches('.').chars().take(60).collect()
}

/// Čas jako „2026-10-26 11-40-12“ (UTC) pro název složky zálohy.
pub(crate) fn utc_stamp() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (days, rest) = ((secs / 86_400) as i64, secs % 86_400);
    // Občanské datum ze dnů od 1. 1. 1970 (algoritmus H. Hinnanta)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02} {:02}-{:02}-{:02}", rest / 3600, rest % 3600 / 60, rest % 60)
}

/// Přesun do Koše (SHFileOperation s FOF_ALLOWUNDO) – obnovitelné z Koše.
#[cfg(windows)]
pub(crate) fn to_recycle_bin(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE, SHFILEOPSTRUCTW,
    };
    if !path.exists() {
        return Err("soubor ani složka neexistuje".into());
    }
    // Seznam cest zakončený dvěma nulami
    let from: Vec<u16> = path.as_os_str().encode_wide().chain([0, 0]).collect();
    let mut operation = SHFILEOPSTRUCTW {
        hwnd: std::ptr::null_mut(),
        wFunc: FO_DELETE,
        pFrom: from.as_ptr(),
        pTo: std::ptr::null(),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT) as u16,
        fAnyOperationsAborted: 0,
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: std::ptr::null(),
    };
    // SAFETY: struktura i řetězec cest žijí po celou dobu volání
    let result = unsafe { SHFileOperationW(&mut operation) };
    if result != 0 || operation.fAnyOperationsAborted != 0 {
        return Err(format!("SHFileOperation: {result}"));
    }
    Ok(())
}

#[cfg(not(windows))]
pub(crate) fn to_recycle_bin(_path: &Path) -> Result<(), String> {
    Err("jen ve Windows".into())
}

/// Registr Windows podle cest „HKCU\Software\…“ / „HKLM\SOFTWARE\…“ (64bit pohled).
#[cfg(windows)]
pub(crate) mod registry {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE};
    use winreg::RegKey;

    fn split(path: &str) -> Option<(RegKey, &str)> {
        let (hive, rest) = path.split_once('\\')?;
        let root = match hive {
            "HKCU" => RegKey::predef(HKEY_CURRENT_USER),
            "HKLM" => RegKey::predef(HKEY_LOCAL_MACHINE),
            _ => return None,
        };
        Some((root, rest))
    }

    fn open(path: &str) -> Option<RegKey> {
        let (root, rest) = split(path)?;
        root.open_subkey_with_flags(rest, KEY_READ).ok()
    }

    pub fn subkeys(path: &str) -> Vec<String> {
        open(path).map(|key| key.enum_keys().flatten().collect()).unwrap_or_default()
    }

    pub fn exists(path: &str) -> bool {
        open(path).is_some()
    }

    /// Počet hodnot klíče i podklíčů (nejvýš 10 000).
    pub fn value_count(path: &str) -> u64 {
        fn count(key: &RegKey, budget: &mut u64) -> u64 {
            let mut total = key.enum_values().count() as u64;
            for name in key.enum_keys().flatten() {
                if *budget == 0 {
                    break;
                }
                *budget -= 1;
                if let Ok(sub) = key.open_subkey_with_flags(&name, KEY_READ) {
                    total += count(&sub, budget);
                }
            }
            total
        }
        open(path).map(|key| count(&key, &mut 10_000)).unwrap_or(0)
    }

    pub fn delete(path: &str) -> Result<(), String> {
        let (root, rest) = split(path).ok_or("neplatný klíč")?;
        root.delete_subkey_all(rest).map_err(|e| e.to_string())
    }

    /// Názvy hodnot klíče (bez výchozí hodnoty).
    pub fn value_names(path: &str) -> Vec<String> {
        open(path).map(|key| key.enum_values().flatten().map(|(name, _)| name).filter(|n| !n.is_empty()).collect()).unwrap_or_default()
    }

    pub fn has_value(path: &str, name: &str) -> bool {
        open(path).is_some_and(|key| key.get_raw_value(name).is_ok())
    }

    pub fn delete_value(path: &str, name: &str) -> Result<(), String> {
        let (root, rest) = split(path).ok_or("neplatný klíč")?;
        let key = root.open_subkey_with_flags(rest, KEY_SET_VALUE).map_err(|e| e.to_string())?;
        key.delete_value(name).map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
pub(crate) mod registry {
    pub fn subkeys(_path: &str) -> Vec<String> {
        Vec::new()
    }
    pub fn exists(_path: &str) -> bool {
        false
    }
    pub fn value_count(_path: &str) -> u64 {
        0
    }
    pub fn delete(_path: &str) -> Result<(), String> {
        Err("jen ve Windows".into())
    }
    pub fn value_names(_path: &str) -> Vec<String> {
        Vec::new()
    }
    pub fn has_value(_path: &str, _name: &str) -> bool {
        false
    }
    pub fn delete_value(_path: &str, _name: &str) -> Result<(), String> {
        Err("jen ve Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user_root(dir: PathBuf) -> Root {
        Root { dir, admin: false, shortcuts: false }
    }

    #[test]
    fn keys_from_name_and_id() {
        let (apps, publisher) = name_keys("Mozilla Firefox (x64 cs)", "Mozilla.Firefox");
        assert!(apps.contains("mozillafirefox") && apps.contains("firefox"));
        assert_eq!(publisher.as_deref(), Some("mozilla"));
        let (apps, publisher) = name_keys("Discord", "ARP\\User\\X64\\Discord");
        assert_eq!(apps, HashSet::from(["discord".to_string()]));
        assert_eq!(publisher, None);
        // Obecné názvy se nehledají
        let (apps, _) = name_keys("Microsoft", "Microsoft.Temp");
        assert!(apps.is_empty());
    }

    #[test]
    fn finds_leftovers_but_keeps_folders_in_use() {
        let root = std::env::temp_dir().join(format!("unibox-leftovers-{}", std::process::id()));
        let roaming = root.join("Roaming");
        let programs = root.join("Programs");
        for dir in [
            roaming.join("discord").join("Cache"),
            roaming.join("Google").join("Chrome").join("Profile"),
            roaming.join("Google").join("Drive"),
            programs.join("Python").join("Python311"),
            roaming.join("Notepad++"),
        ] {
            std::fs::create_dir_all(&dir).unwrap();
        }
        std::fs::write(roaming.join("discord").join("Cache").join("data"), vec![0u8; 1000]).unwrap();
        let roots = [user_root(roaming.clone()), user_root(programs.clone())];

        let found = scan_folders(&roots, "Discord", "ARP\\User\\X64\\Discord", &Installed::none());
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("discord") && found[0].size == 1000 && found[0].files == 1);
        assert_eq!(found[0].kind, Kind::Folder);

        // Podsložka vydavatele – jen Chrome, ne Drive
        let found = scan_folders(&roots, "Google Chrome", "Google.Chrome.EXE", &Installed::none());
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("Chrome"));

        // Python 3.12 odinstalován, ale Python 3.11 (ve stejné složce) zůstává nainstalovaný
        let python311 = programs.join("Python").join("Python311").to_string_lossy().to_lowercase();
        let installed = Installed { paths: vec![python311], names: HashSet::new() };
        assert!(scan_folders(&roots, "Python 3.12.7 (64-bit)", "Python.Python.3.12", &installed).is_empty());
        // … a stejně tak podle názvu nainstalovaného programu
        let installed = Installed { paths: Vec::new(), names: HashSet::from(["python".to_string()]) };
        assert!(scan_folders(&roots, "Python 3.12.7 (64-bit)", "Python.Python.3.12", &installed).is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn still_installed_apps_are_protected() {
        let installed = Installed {
            paths: Vec::new(),
            names: HashSet::from(["vlcmediaplayer".to_string(), "firefoxdeveloperedition".to_string()]),
        };
        assert!(installed.blocks("vlcmediaplayer"));
        // Firefox sdílí profil s nainstalovanou Developer Edition
        assert!(installed.blocks("firefox"));
        // Krátký klíč jen přesně
        assert!(!installed.blocks("vlc"));
        assert!(installed.owns(Path::new(r"C:\Users\x\Desktop\VLC media player.lnk")));
    }

    #[test]
    fn finds_shortcuts() {
        let root = std::env::temp_dir().join(format!("unibox-shortcuts-{}", std::process::id()));
        std::fs::create_dir_all(root.join("OBS Studio")).unwrap();
        for file in ["OBS Studio (64bit).lnk", "Firefox.lnk", "OBS Studio.txt"] {
            std::fs::write(root.join(file), b"").unwrap();
        }
        let roots = [Root { dir: root.clone(), admin: false, shortcuts: true }];
        let mut found: Vec<String> = scan_folders(&roots, "OBS Studio", "OBSProject.OBSStudio", &Installed::none())
            .into_iter()
            .map(|l| Path::new(&l.path).file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        found.sort();
        assert_eq!(found, ["OBS Studio", "OBS Studio (64bit).lnk"]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn registry_rules() {
        assert!(registry_allowed(r"HKCU\Software\OBS Studio"));
        assert!(registry_allowed(r"HKCU\Software\Mozilla\Firefox"));
        assert!(registry_allowed(r"HKLM\SOFTWARE\WOW6432Node\VideoLAN\VLC"));
        assert!(registry_allowed(r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{44E8}_is1"));
        // Sdílené a systémové klíče ani hlubší cesty nikdy
        assert!(!registry_allowed(r"HKCU\Software\Microsoft"));
        assert!(!registry_allowed(r"HKCU\Software\Classes"));
        assert!(!registry_allowed(r"HKLM\SOFTWARE\Microsoft\Windows"));
        assert!(!registry_allowed(r"HKCU\Software\Mozilla"));
        assert!(!registry_allowed(r"HKLM\SYSTEM\CurrentControlSet\Services\X"));
        assert!(!registry_allowed(r"HKCU\Software\A\B\C"));
        assert!(!registry_allowed(r"HKCR\Software\X"));
    }

    #[test]
    fn path_rules() {
        let program_files = env_dir("ProgramW6432").or_else(|| env_dir("ProgramFiles")).unwrap();
        let appdata = env_dir("APPDATA").unwrap();
        assert!(path_allowed(Kind::Folder, &program_files.join("obs-studio")));
        assert!(path_allowed(Kind::Folder, &appdata.join("Mozilla").join("Firefox")));
        // Kořen, chráněné názvy, příliš hluboko, mimo kořeny, „..“
        assert!(!path_allowed(Kind::Folder, &program_files));
        assert!(!path_allowed(Kind::Folder, &program_files.join("Common Files")));
        assert!(!path_allowed(Kind::Folder, &appdata.join("Microsoft")));
        assert!(!path_allowed(Kind::Folder, &appdata.join("a").join("b").join("c")));
        assert!(!path_allowed(Kind::Folder, Path::new(r"C:\Windows\System32\drivers")));
        assert!(!path_allowed(Kind::Folder, &appdata.join("..").join("Local")));
        // Soubor jen jako zástupce v nabídce Start / na ploše
        assert!(!path_allowed(Kind::File, &appdata.join("OBS.lnk")));
        let start_menu = appdata.join(r"Microsoft\Windows\Start Menu\Programs");
        assert!(path_allowed(Kind::File, &start_menu.join("OBS Studio.lnk")));
        assert!(!path_allowed(Kind::File, &start_menu.join("setup.exe")));
    }

    #[test]
    fn stamp_format() {
        let stamp = utc_stamp();
        assert_eq!(stamp.len(), 19);
        assert!(stamp.starts_with("20"));
        assert_eq!(safe_file_name("OBS: Studio?"), "OBS_ Studio_");
    }
}
