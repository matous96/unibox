//! Programy nalezené jen podle souborů na disku – poslední úroveň detekce
//! nainstalovaných aplikací (po wingetu a registru).
//!
//! Některé programy záznam v registru nemají: rozbalené do Program Files,
//! instalace do profilu uživatele bez záznamu, záznam smazaný „čističem“.
//! Projdou se složky, kam se programy instalují – Program Files,
//! %LocalAppData%\Programs, %LocalAppData% a %AppData% – a za program se počítá
//! složka, v níž (nebo nejvýš o dvě úrovně níž) je EXE pojmenované stejně jako
//! složka: „Discord\app-1.0.9264\Discord.exe“, „Telegram Desktop\Telegram.exe“,
//! „Mozilla Firefox\firefox.exe“. Datové složky aplikací (bez EXE) a sdílené
//! složky výrobců („Microsoft“) programem nejsou. Složka výrobce v Program Files
//! se projde o úroveň hlouběji („VideoLAN\VLC\vlc.exe“); v AppData ne – tam
//! bývají o úroveň níž nástroje přibalené k jiné aplikaci (UniGetUI\Chocolatey).
//!
//! Složka s EXE sama nestačí – některé odinstalátory nechají celý program na
//! disku (EA app). Program se počítá, jen když na něj míří zástupce v nabídce
//! Start ([`with_shortcut`]): ten instalace vytvoří a odinstalace odstraní.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::arp::{self, find_exe, folder_key, name_key};

/// Složka programu na disku.
#[derive(Debug, Clone, PartialEq)]
pub struct DiskApp {
    /// Název složky („Discord“).
    pub name: String,
    pub folder: PathBuf,
}

/// Složky, které programy nejsou a jejichž procházení by stálo čas (dočasné soubory, balíčky Storu…).
const SKIP: &[&str] = &[
    "temp", "tmp", "packages", "microsoft", "windowsapps", "modifiablewindowsapps", "common files", "programs",
    "crashdumps", "d3dscache", "package cache", "windows defender", "windows nt", "windowspowershell",
];

/// Složka výrobce se projde, jen když má nejvýš tolik podsložek (VideoLAN: VLC).
const VENDOR_LIMIT: usize = 16;
/// Kolik složek nejvýš projde hledání EXE v jedné složce programu.
const FOLDER_BUDGET: usize = 40;

/// Složka, do které se programy instalují; `vendors` = složky výrobců projít o úroveň hlouběji.
struct Base {
    dir: PathBuf,
    vendors: bool,
}

fn bases() -> Vec<Base> {
    let var = |name: &str| std::env::var_os(name).map(PathBuf::from);
    let local = var("LOCALAPPDATA");
    let candidates = [
        (var("ProgramW6432").or_else(|| var("ProgramFiles")), true),
        (var("ProgramFiles(x86)"), true),
        (local.as_ref().map(|dir| dir.join("Programs")), false),
        (local, false),
        (var("APPDATA"), false),
    ];
    let mut bases: Vec<Base> = Vec::new();
    for (dir, vendors) in candidates {
        let Some(dir) = dir else { continue };
        if !bases.iter().any(|known| folder_key(&known.dir) == folder_key(&dir)) {
            bases.push(Base { dir, vendors });
        }
    }
    bases
}

/// Odpovídá název EXE názvu složky? Stejný klíč, nebo jeden začíná či končí
/// druhým (aspoň 4 znaky): „Telegram Desktop“ – „Telegram“, „Mozilla Firefox“ – „firefox“.
fn named_like(exe_key: &str, folder_key: &str) -> bool {
    if exe_key.is_empty() || folder_key.is_empty() {
        return false;
    }
    if exe_key == folder_key {
        return true;
    }
    let (short, long) = if exe_key.len() < folder_key.len() { (exe_key, folder_key) } else { (folder_key, exe_key) };
    short.len() >= 4 && (long.starts_with(short) || long.ends_with(short))
}

/// EXE programu pojmenované jako složka (ve složce nebo nejvýš o dvě úrovně níž).
fn program_exe(folder: &Path, key: &str) -> Option<PathBuf> {
    find_exe(folder, 2, FOLDER_BUDGET, |file| {
        arp::is_app_exe(file) && named_like(&name_key(file.rsplit_once('.').map_or(file, |(stem, _)| stem)), key)
    })
}

/// Podsložky (bez odkazů – junction).
fn subfolders(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect()
}

/// Programy ve složkách `bases`. Složky, které `covered` (patří programu
/// z registru, i s podsložkami), se neprocházejí; programy, jejichž klíč
/// názvu je `known` (nalezené wingetem / v registru), se vynechají.
fn scan_in(bases: &[Base], covered: impl Fn(&Path) -> bool, known: impl Fn(&str) -> bool) -> Vec<DiskApp> {
    let mut apps = Vec::new();
    let mut visited = HashSet::new();
    // Je složka program? (Nový program přidá do seznamu.)
    let mut program = |folder: &Path, apps: &mut Vec<DiskApp>| -> bool {
        let name = folder.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let key = name_key(&name);
        if key.len() < 2 || !visited.insert(folder_key(folder)) || program_exe(folder, &key).is_none() {
            return false;
        }
        if !known(&key) {
            apps.push(DiskApp { name, folder: folder.to_path_buf() });
        }
        true
    };
    for base in bases {
        for folder in subfolders(&base.dir) {
            let lower = folder.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
            if SKIP.contains(&lower.as_str()) || lower.starts_with('.') || lower.starts_with("windows") || covered(&folder) {
                continue;
            }
            if program(&folder, &mut apps) || !base.vendors {
                continue;
            }
            // Složka výrobce („VideoLAN“) – programy o úroveň níž
            let nested = subfolders(&folder);
            if nested.len() <= VENDOR_LIMIT {
                for inner in nested.iter().filter(|inner| !covered(inner)) {
                    program(inner, &mut apps);
                }
            }
        }
    }
    apps
}

/// Programy na disku, které nezná winget ani registr: vynechá složky, na které
/// odkazuje některý záznam registru (i pozůstatek – jeho složka už EXE nemá),
/// a programy se stejným klíčem názvu jako `known` (už nalezené).
pub fn scan(registry_folders: &[String], known: &HashSet<String>) -> Vec<DiskApp> {
    let covered = |folder: &Path| {
        let folder = folder_key(folder);
        registry_folders.iter().any(|dir| {
            dir == &folder || dir.starts_with(&format!("{folder}\\")) || folder.starts_with(&format!("{dir}\\"))
        })
    };
    scan_in(&bases(), covered, |key| known.contains(key))
}

/// Jen programy, do jejichž složky míří některý ze spouštěcích souborů
/// nabídky Start (`targets`, cesty malými písmeny – apps::launch_targets).
pub fn with_shortcut(apps: Vec<DiskApp>, targets: &[String]) -> Vec<DiskApp> {
    apps.into_iter()
        .filter(|app| {
            let inside = format!("{}\\", folder_key(&app.folder));
            targets.iter().any(|target| target.starts_with(&inside))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arp::tests::temp_tree;

    #[test]
    fn exe_names() {
        assert!(named_like("discord", "discord"));
        assert!(named_like("telegram", "telegramdesktop"));
        assert!(named_like("firefox", "mozillafirefox"));
        assert!(named_like("ollamaapp", "ollama"));
        assert!(!named_like("obs64", "obsstudio"));
        assert!(!named_like("onedrive", "microsoft"));
        // Krátké názvy jen přesně
        assert!(!named_like("vlc", "vlcplayer"));
        assert!(named_like("vlc", "vlc"));
    }

    #[test]
    fn finds_programs() {
        let base = temp_tree(
            "disk",
            &[
                r"Discord\Update.exe",
                r"Discord\app-1.0.9264\Discord.exe",
                r"Telegram Desktop\Telegram.exe",
                r"VideoLAN\VLC\vlc.exe",
                r"Code\User\settings.json",
                r"Leftover\Update.exe",
                r"Microsoft\Teams\Teams.exe",
                r"Known\Known.exe",
                r"Registered\Tool\Tool.exe",
            ],
        );
        let registered = base.join("Registered");
        let covered = |folder: &Path| folder.starts_with(&registered);
        let names = |vendors: bool| {
            let apps = scan_in(&[Base { dir: base.clone(), vendors }], covered, |key| key == "known");
            let mut names: Vec<String> = apps.into_iter().map(|app| app.name).collect();
            names.sort();
            names
        };
        // Program Files: složka výrobce o úroveň hlouběji
        assert_eq!(names(true), ["Discord", "Telegram Desktop", "VLC"]);
        // AppData: jen přímé podsložky
        assert_eq!(names(false), ["Discord", "Telegram Desktop"]);
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn requires_start_menu_shortcut() {
        let app = |folder: &str| DiskApp { name: String::new(), folder: PathBuf::from(folder) };
        let apps = vec![app(r"C:\Program Files\Electronic Arts\EA Desktop"), app(r"C:\Users\X\AppData\Local\PCHealthCheck")];
        let targets = [r"c:\users\x\appdata\local\pchealthcheck\pchealthcheck.exe".to_string()];
        let kept = with_shortcut(apps, &targets);
        assert_eq!(kept, [app(r"C:\Users\X\AppData\Local\PCHealthCheck")]);
    }

    /// Programy nalezené jen na disku na tomto počítači:
    /// `cargo test disk::tests::survey -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn survey() {
        let started = std::time::Instant::now();
        let registry = arp::Registry::load();
        let known: HashSet<String> = registry.installed().iter().map(|e| name_key(&e.name)).collect();
        let apps = scan(&registry.folders(), &known);
        println!("{} programů jen na disku za {:?}: {apps:#?}", apps.len(), started.elapsed());
    }
}
