//! Spouštění nainstalovaných aplikací.
//!
//! Spustitelné aplikace = položky nabídky Start (složka `shell:AppsFolder`,
//! stejný seznam jako `Get-StartApps`): klasické programy i aplikace
//! z Microsoft Storu, každá se svým AppID. Spouští se stejně jako z nabídky
//! Start – `explorer.exe shell:AppsFolder\<AppID>`. Odkazy na web, dokumentace
//! a odinstalátory se vynechají, stejně jako zástupci, jejichž EXE na disku už
//! není (pozůstatky po odinstalaci) – cíl zástupce se ověří i u AppID, které
//! cestou není (Discord: „com.squirrel.Discord.Discord“ → …\Discord.exe).
//! Spustit jde jen aplikaci z aktuálního seznamu – frontend nemůže předat libovolný příkaz.

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::arp;
use crate::powershell;
use crate::process::background;

/// Spustitelná aplikace; `target` = její spouštěcí soubor (cesta malými písmeny),
/// pokud ho jde určit – frontend podle něj najde zástupce programu nalezeného na disku.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartApp {
    name: String,
    app_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<String>,
}

/// Položka nabídky Start i s cílem zástupce (System.Link.TargetParsingPath):
/// cesta k EXE, adresa webu, u aplikací ze Storu prázdný.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellApp {
    name: String,
    app_id: String,
    target: String,
}

/// Poslední načtený seznam (kvůli ověření při spuštění).
static LAST: Mutex<Vec<StartApp>> = Mutex::new(Vec::new());
/// Spouštěcí soubory aplikací z posledního seznamu (cesty malými písmeny) a čas načtení.
static TARGETS: Mutex<Option<(Instant, Vec<String>)>> = Mutex::new(None);

/// Položky nabídky Start, které jsou opravdu aplikace.
fn load() -> Result<Vec<StartApp>, String> {
    let value = powershell::call(
        "foreach ($i in (New-Object -ComObject Shell.Application).NameSpace('shell:AppsFolder').Items()) { \
         [pscustomobject]@{ name = [string]$i.Name; appId = [string]$i.Path; \
         target = [string]$i.ExtendedProperty('System.Link.TargetParsingPath') } }",
        Duration::from_secs(30),
    )?;
    let apps: Vec<StartApp> = serde_json::from_value::<Vec<ShellApp>>(value)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|app| !app.app_id.is_empty() && is_launchable(&app.name, &app.app_id) && is_launchable(&app.name, &app.target))
        .filter(|app| target_exists(&app.target) && target_exists(&app.app_id))
        .map(|app| {
            let target = resolve_path(&app.target).or_else(|| resolve_path(&app.app_id)).map(|path| arp::folder_key(&path));
            StartApp { name: app.name, app_id: app.app_id, target }
        })
        .collect();
    let targets = apps.iter().filter_map(|app| app.target.clone()).collect();
    *TARGETS.lock().unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), targets));
    *LAST.lock().unwrap_or_else(|e| e.into_inner()) = apps.clone();
    Ok(apps)
}

/// Spouštěcí soubory aplikací v nabídce Start (cesty malými písmeny) – ze seznamu
/// načteného nejvýš před `max_age`, jinak se seznam načte znovu.
pub fn launch_targets(max_age: Duration) -> Result<Vec<String>, String> {
    if let Some((at, targets)) = TARGETS.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        if at.elapsed() < max_age {
            return Ok(targets.clone());
        }
    }
    load()?;
    Ok(TARGETS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|(_, targets)| targets.clone()).unwrap_or_default())
}

/// Je aplikace v nabídce Start (v posledním, případně čerstvě načteném seznamu)?
pub fn is_known_app(app_id: &str) -> Result<bool, String> {
    let known = |apps: &[StartApp]| apps.iter().any(|a| a.app_id == app_id);
    let cached = LAST.lock().unwrap_or_else(|e| e.into_inner()).clone();
    Ok(known(&cached) || known(&load()?))
}

/// Známé složky Windows v AppID klasických programů („{GUID}\VideoLAN\VLC\vlc.exe“).
const KNOWN_FOLDERS: &[(&str, &str)] = &[
    ("{6D809377-6AF0-444B-8957-A3773F02200E}", "ProgramW6432"), // Program Files
    ("{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}", "ProgramFiles(x86)"),
    ("{905E63B6-C1BF-494E-B29C-65B732D3D21A}", "ProgramFiles"),
    ("{F1B32785-6FBA-4FCF-9D55-7B8E7F157091}", "LOCALAPPDATA"),
    ("{3EB685DB-65F9-4CF6-A03A-E3EF65729F3D}", "APPDATA"),
    ("{62AB5D82-FDC1-4DC3-A9DD-070D1D495D97}", "ProgramData"),
    ("{F38BF404-1D43-42F2-9305-67DE0B28FC23}", "SystemRoot"),
];

/// Existuje spouštěcí soubor aplikace? Cesta („C:\…\app.exe“, „{GUID známé
/// složky}\…\app.exe“) se ověří na disku; ostatní (aplikace ze Storu,
/// AppUserModelID, prázdný cíl) ověřit nejde a berou se jako existující.
fn target_exists(app_id: &str) -> bool {
    match resolve_path(app_id) {
        Some(path) => path.exists(),
        None => true,
    }
}

fn resolve_path(app_id: &str) -> Option<std::path::PathBuf> {
    let bytes = app_id.as_bytes();
    // Absolutní cesta „C:\…“
    if bytes.len() > 2 && bytes[1] == b':' && (bytes[2] == b'\\' || bytes[2] == b'/') {
        return Some(app_id.into());
    }
    // „{GUID}\relativní cesta“ – známá složka přes proměnnou prostředí
    let (guid, rest) = app_id.split_once('\\')?;
    let (_, variable) = KNOWN_FOLDERS.iter().find(|(id, _)| id.eq_ignore_ascii_case(guid))?;
    let base = std::env::var(variable).ok()?;
    Some(std::path::Path::new(&base).join(rest))
}

/// Dokumenty, které mají v nabídce Start vlastní zástupce.
const DOCUMENT_EXTENSIONS: &[&str] =
    &[".chm", ".pdf", ".html", ".htm", ".txt", ".url", ".md", ".rtf", ".hlp", ".doc", ".docx", ".log", ".ini", ".xml"];

/// Zástupci, kteří nejsou aplikace (anglicky i česky).
const NOT_APP_WORDS: &[&str] = &[
    "readme", "read me", "release notes", "changelog", "help", "nápověda", "manual", "user guide",
    "documentation", "dokumentace", "website", "web site", "na internetu", "support center", "getting started",
    "reset preferences", "license", "licence", "updater",
];

/// Odinstalátory podle názvu („Uninstall Node.js“, „Odinstalovat aplikaci…“) –
/// jen na začátku, aplikace jako „Revo Uninstaller“ zůstanou.
const UNINSTALL_PREFIXES: &[&str] = &["uninstall", "odinstal"];

/// Je položka aplikace? `id` = AppID nebo cíl zástupce (prázdný cíl nevadí).
fn is_launchable(name: &str, id: &str) -> bool {
    let id = id.to_lowercase();
    let name = name.to_lowercase();
    if id.starts_with("http://") || id.starts_with("https://") || id.starts_with("mailto:") {
        return false;
    }
    if DOCUMENT_EXTENSIONS.iter().any(|ext| id.ends_with(ext)) {
        return false;
    }
    let file = id.rsplit(['\\', '/']).next().unwrap_or_default();
    if file.starts_with("unins") || file.starts_with("uninstall") {
        return false;
    }
    !UNINSTALL_PREFIXES.iter().any(|prefix| name.starts_with(prefix)) && !NOT_APP_WORDS.iter().any(|word| name.contains(word))
}

/// Seznam spustitelných aplikací (frontend podle názvu najde tu nainstalovanou).
#[tauri::command]
pub async fn start_apps() -> Result<Vec<StartApp>, String> {
    background(load).await
}

/// Spustí aplikaci z nabídky Start.
#[tauri::command]
pub async fn launch_app(app_id: String) -> Result<(), String> {
    background(move || {
        // Nová aplikace (nainstalovaná po načtení seznamu) – is_known_app seznam obnoví
        if !is_known_app(&app_id)? {
            return Err("Aplikace v nabídce Start není".into());
        }
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        Command::new(std::path::Path::new(&root).join("explorer.exe"))
            .arg(format!("shell:AppsFolder\\{app_id}"))
            .spawn()
            .map_err(|e| format!("Aplikaci se nepodařilo spustit: {e}"))?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_non_apps() {
        assert!(is_launchable("VLC media player", r"{6D809377-6AF0-444B-8957-A3773F02200E}\VideoLAN\VLC\vlc.exe"));
        assert!(is_launchable("Discord", "com.squirrel.Discord.Discord"));
        assert!(!is_launchable("Steam Support Center", "http://support.steampowered.com/"));
        assert!(!is_launchable("KeePass User Manual", r"{7C5A40EF}\KeePass2x\KeePass.chm"));
        assert!(!is_launchable("Uninstall", r"{6D809377}\HandBrake\uninst.exe"));
        assert!(!is_launchable("Odinstalovat aplikaci Revo Uninstaller", r"C:\x\unins000.exe"));
        assert!(!is_launchable("Uninstall Node.js", "Microsoft.AutoGenerated.{AF67A1BD}"));
        assert!(!is_launchable("EA app Updater", r"C:\EA\EAUpdater.exe"));
        // Aplikace s „Uninstaller“ v názvu je pořád aplikace
        assert!(is_launchable("Revo Uninstaller", r"{6D809377}\VS Revo Group\Revo Uninstaller\RevoUnin.exe"));
        // Cíl zástupce s AppUserModelID: dokumentace, odinstalátor; prázdný cíl (Store) nevadí
        assert!(!is_launchable("Mp3tag Příručka", r"C:\Program Files\Mp3tag\Mp3tag.chm"));
        assert!(!is_launchable("Foo", r"C:\Program Files\Foo\uninstall.exe"));
        assert!(is_launchable("Kalkulačka", ""));
    }

    #[test]
    fn verifies_executable_on_disk() {
        // Pozůstatek po odinstalaci – zástupce na neexistující EXE
        assert!(!target_exists(r"C:\Neexistujici slozka HubGetu\aplikace.exe"));
        let windows = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        assert!(target_exists(&format!(r"{windows}\explorer.exe")));
        assert!(target_exists(r"{F38BF404-1D43-42F2-9305-67DE0B28FC23}\explorer.exe"));
        // AppUserModelID aplikace ze Storu ani prázdný cíl ověřit nejde
        assert!(target_exists("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"));
        assert!(target_exists(""));
    }
}
