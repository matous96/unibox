//! Publikování aplikace do WinGetu – komunitní open-source repozitář
//! microsoft/winget-pkgs, ze kterého Unibox bere katalog. Podklady pro
//! průvodce (pages/PublishWingetPage.tsx):
//!
//! - `publish_analyze_installer` – stáhne instalátor (curl, dočasná složka),
//!   spočítá SHA-256 a velikost, pozná typ instalátoru (MSI / WiX, MSIX,
//!   Inno Setup, NSIS, WiX Burn, ZIP, EXE) a architekturu a přečte název,
//!   vydavatele a verzi (informace o verzi EXE, vlastnosti MSI včetně
//!   ProductCode). Instalátor se **nespouští** a po analýze se smaže.
//! - `publish_validate_manifest` – `winget validate` nad vygenerovaným manifestem.
//! - `publish_save_manifest` – uloží manifest do složky vybrané v dialogu.
//! - `github_device_start` / `github_device_poll` – přihlášení ke GitHubu
//!   (OAuth device flow, RFC 8628) pro odeslání pull requestu; token dostane
//!   jen frontend do paměti, na disk se neukládá.

use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

use crate::download::{self, Fetch};
use crate::process::{self, hidden_command, system_tool, CancelToken};

/// Výsledek analýzy instalátoru.
#[derive(Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstallerAnalysis {
    pub file_name: String,
    pub size: u64,
    /// SHA-256 velkými písmeny (tak ho chce winget-pkgs).
    pub sha256: String,
    /// Typ podle schématu manifestu: msi, wix, msix, inno, nullsoft, burn, zip, exe.
    pub installer_type: String,
    /// x64, x86, arm64 nebo neutral.
    pub architecture: String,
    /// Odkud je architektura: url (název souboru), binary (hlavička EXE), guess (odhad – zkontrolovat).
    pub architecture_source: String,
    pub product_name: Option<String>,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub copyright: Option<String>,
    /// ProductCode instalátoru MSI (winget podle něj pozná nainstalovanou aplikaci).
    pub product_code: Option<String>,
}

/// Jeden soubor manifestu (název bez cesty, obsah YAML).
#[derive(Debug, Deserialize)]
pub struct ManifestFile {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Validation {
    pub ok: bool,
    pub output: String,
}

const WORK_DIR: &str = "unibox-publish";
/// Kolik bajtů naráz číst při hledání značek instalátoru.
const CHUNK: usize = 1 << 20;

// ── Rozpoznání instalátoru (čisté funkce – testy dole) ───────────────────

/// Architektura podle názvu souboru / adresy („…-x64.exe“, „…_arm64.msi“).
pub fn architecture_from_name(name: &str) -> Option<&'static str> {
    let name = name.to_ascii_lowercase();
    let has = |keys: &[&str]| keys.iter().any(|k| name.contains(k));
    if has(&["arm64", "aarch64"]) {
        Some("arm64")
    } else if has(&["x64", "amd64", "win64", "x86_64", "x86-64", "64bit", "64-bit"]) {
        Some("x64")
    } else if has(&["x86", "win32", "i386", "i686", "32bit", "32-bit", "ia32"]) {
        Some("x86")
    } else {
        None
    }
}

/// Architektura z hlavičky PE (pole Machine).
pub fn pe_architecture(head: &[u8]) -> Option<&'static str> {
    if head.len() < 0x40 || &head[..2] != b"MZ" {
        return None;
    }
    let offset = u32::from_le_bytes(head[0x3c..0x40].try_into().ok()?) as usize;
    if head.len() < offset + 6 || &head[offset..offset + 4] != b"PE\0\0" {
        return None;
    }
    match u16::from_le_bytes([head[offset + 4], head[offset + 5]]) {
        0x8664 => Some("x64"),
        0x014c => Some("x86"),
        0xaa64 => Some("arm64"),
        _ => None,
    }
}

/// Značky v souboru, podle kterých se pozná typ instalátoru.
const MARKERS: [&[u8]; 8] = [
    b"Windows Installer XML", // 0 WiX (MSI)
    b"WiX Toolset",           // 1 WiX (MSI)
    b"AppxManifest.xml",      // 2 MSIX / APPX
    b"AppxBundleManifest.xml", // 3 MSIX bundle
    b".wixburn",              // 4 WiX Burn (oddíl PE)
    b"Inno Setup",            // 5 Inno Setup
    b"Nullsoft",              // 6 NSIS
    b"NullsoftInst",          // 7 NSIS
];

/// Typ instalátoru podle začátku souboru a nalezených značek (`found[i]` pro MARKERS[i]).
pub fn installer_type(head: &[u8], file_name: &str, found: &[bool]) -> &'static str {
    let ext = Path::new(file_name).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if head.starts_with(&[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) {
        return if found[0] || found[1] { "wix" } else { "msi" };
    }
    if head.starts_with(b"PK\x03\x04") {
        let appx = found[2] || found[3] || matches!(ext.as_str(), "msix" | "appx" | "msixbundle" | "appxbundle");
        return if appx { "msix" } else { "zip" };
    }
    if head.starts_with(b"MZ") {
        return if found[4] {
            "burn"
        } else if found[5] {
            "inno"
        } else if found[6] || found[7] {
            "nullsoft"
        } else {
            "exe"
        };
    }
    "exe"
}

/// Najde značky v souboru (po kusech s překryvem – značka může ležet přes hranici).
fn scan(path: &Path, needles: &[&[u8]]) -> std::io::Result<Vec<bool>> {
    let mut file = std::fs::File::open(path)?;
    let overlap = needles.iter().map(|n| n.len()).max().unwrap_or(0);
    let mut found = vec![false; needles.len()];
    let mut window: Vec<u8> = Vec::with_capacity(CHUNK + overlap);
    let mut buffer = vec![0u8; CHUNK];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        window.extend_from_slice(&buffer[..n]);
        for (i, needle) in needles.iter().enumerate() {
            if !found[i] && window.windows(needle.len()).any(|w| w == *needle) {
                found[i] = true;
            }
        }
        if found.iter().all(|&f| f) {
            break;
        }
        let keep = window.len().saturating_sub(overlap);
        window.drain(..keep);
    }
    Ok(found)
}

/// SHA-256 souboru (hex velkými písmeny).
fn sha256_upper(path: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 16];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02X}")).collect())
}

/// Název souboru z adresy (bez parametrů), jen bezpečné znaky.
fn file_name_from_url(url: &str) -> String {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let name: String = path
        .rsplit('/')
        .next()
        .unwrap_or("")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+') { c } else { '_' })
        .take(120)
        .collect();
    if name.trim_matches(['.', '_']).is_empty() {
        "installer.bin".into()
    } else {
        name
    }
}

// ── Vlastnosti MSI ───────────────────────────────────────────────────────

/// ProductCode, ProductName, Manufacturer, ProductVersion z tabulky Property.
#[cfg(windows)]
fn msi_properties(path: &Path) -> [Option<String>; 4] {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::ApplicationInstallationAndServicing::{
        MsiCloseHandle, MsiDatabaseOpenViewW, MsiOpenDatabaseW, MsiRecordGetStringW, MsiViewExecute, MsiViewFetch, MSIDBOPEN_READONLY,
        MSIHANDLE,
    };
    let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let file: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut result: [Option<String>; 4] = Default::default();
    // SAFETY: řetězce končí nulou, popisovače MSI se vždy zavřou, vyrovnávací
    // paměť pro hodnotu má délku, kterou si řekne MsiRecordGetStringW.
    unsafe {
        let mut db: MSIHANDLE = 0;
        if MsiOpenDatabaseW(file.as_ptr(), MSIDBOPEN_READONLY, &mut db) != 0 {
            return result;
        }
        for (i, property) in ["ProductCode", "ProductName", "Manufacturer", "ProductVersion"].iter().enumerate() {
            let query = wide(&format!("SELECT `Value` FROM `Property` WHERE `Property` = '{property}'"));
            let mut view: MSIHANDLE = 0;
            if MsiDatabaseOpenViewW(db, query.as_ptr(), &mut view) != 0 {
                continue;
            }
            let mut record: MSIHANDLE = 0;
            if MsiViewExecute(view, 0) == 0 && MsiViewFetch(view, &mut record) == 0 {
                let mut len: u32 = 0;
                let mut empty = [0u16; 1];
                // ERROR_MORE_DATA (234) vrátí potřebnou délku
                MsiRecordGetStringW(record, 1, empty.as_mut_ptr(), &mut len);
                let mut buffer = vec![0u16; len as usize + 1];
                let mut size = buffer.len() as u32;
                if MsiRecordGetStringW(record, 1, buffer.as_mut_ptr(), &mut size) == 0 {
                    let value = String::from_utf16_lossy(&buffer[..size as usize]).trim().to_string();
                    result[i] = (!value.is_empty()).then_some(value);
                }
                MsiCloseHandle(record);
            }
            MsiCloseHandle(view);
        }
        MsiCloseHandle(db);
    }
    result
}

#[cfg(not(windows))]
fn msi_properties(_path: &Path) -> [Option<String>; 4] {
    Default::default()
}

// ── Příkazy ──────────────────────────────────────────────────────────────

fn work_dir() -> PathBuf {
    std::env::temp_dir().join(WORK_DIR)
}

/// Rozbor staženého souboru (bez sítě – testovatelné nad místním souborem).
fn analyze_file(path: &Path, url: &str) -> Result<InstallerAnalysis, String> {
    let file_name = file_name_from_url(url);
    let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    let mut head = vec![0u8; 4096];
    let read = std::fs::File::open(path).and_then(|mut f| f.read(&mut head)).map_err(|e| e.to_string())?;
    head.truncate(read);
    let found = scan(path, &MARKERS).map_err(|e| e.to_string())?;
    let kind = installer_type(&head, &file_name, &found);

    let (architecture, source) = match (architecture_from_name(&file_name), pe_architecture(&head)) {
        (Some(arch), _) => (arch, "url"),
        // Instalátory Inno / NSIS / Burn bývají 32bitové i pro 64bitovou aplikaci – jen odhad
        (None, Some(arch)) if kind == "exe" => (arch, "binary"),
        (None, Some(_)) => ("x64", "guess"),
        (None, None) if kind == "msix" || kind == "zip" => ("neutral", "guess"),
        (None, None) => ("x64", "guess"),
    };

    let mut analysis = InstallerAnalysis {
        file_name,
        size,
        sha256: sha256_upper(path).map_err(|e| e.to_string())?,
        installer_type: kind.into(),
        architecture: architecture.into(),
        architecture_source: source.into(),
        ..Default::default()
    };
    if kind == "msi" || kind == "wix" {
        let [code, name, publisher, version] = msi_properties(path);
        analysis.product_code = code;
        analysis.product_name = name;
        analysis.publisher = publisher;
        analysis.version = version;
    } else if head.starts_with(b"MZ") {
        let fields = crate::version_info::fields(path, &["ProductName", "CompanyName", "ProductVersion", "LegalCopyright", "FileVersion"]);
        let [name, publisher, product_version, copyright, file_version]: [Option<String>; 5] = fields.try_into().unwrap_or_default();
        analysis.product_name = name;
        analysis.publisher = publisher;
        analysis.version = product_version.or(file_version).map(|v| v.replace(", ", ".").replace(',', "."));
        analysis.copyright = copyright;
    }
    Ok(analysis)
}

/// Stáhne instalátor a zjistí údaje pro manifest (instalátor se nespouští).
#[tauri::command]
pub async fn publish_analyze_installer(url: String) -> Result<InstallerAnalysis, String> {
    let url = url.trim().to_string();
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("Adresa instalátoru musí začínat https:// (winget-pkgs jiné nepřijme).".into());
    }
    process::background(move || {
        let dir = work_dir();
        let target = dir.join(format!("{}-{}", std::process::id(), file_name_from_url(&url)));
        match download::fetch(&url, &target, &CancelToken::default(), |_| {}) {
            Fetch::Done => {}
            Fetch::Cancelled => return Err("Stahování bylo zrušeno.".into()),
            Fetch::Failed(e) => return Err(format!("Instalátor se nepodařilo stáhnout: {e}")),
        }
        let result = analyze_file(&target, &url);
        let _ = std::fs::remove_file(&target);
        result
    })
    .await
}

/// Bezpečný název souboru manifestu („Publisher.App.installer.yaml“).
fn valid_manifest_name(name: &str) -> bool {
    name.len() <= 200
        && name.ends_with(".yaml")
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
}

fn write_files(dir: &Path, files: &[ManifestFile]) -> Result<(), String> {
    if files.is_empty() || files.len() > 10 || !files.iter().all(|f| valid_manifest_name(&f.name)) {
        return Err("neplatné soubory manifestu".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    for file in files {
        std::fs::write(dir.join(&file.name), &file.content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Ověří manifest příkazem `winget validate` (v dočasné složce, pak ji smaže).
#[tauri::command]
pub async fn publish_validate_manifest(files: Vec<ManifestFile>) -> Result<Validation, String> {
    process::background(move || {
        let dir = work_dir().join(format!("manifest-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
        write_files(&dir, &files)?;
        let mut command = hidden_command(&crate::winget::winget_exe());
        command.args(["validate", "--manifest"]).arg(&dir);
        let result = process::run(command, Duration::from_secs(90));
        let _ = std::fs::remove_dir_all(&dir);
        let output = result?;
        let text: String = output.stdout.lines().map(process::clean_line).filter(|l| !l.trim().is_empty()).collect::<Vec<_>>().join("\n");
        Ok(Validation { ok: output.code == 0, output: text })
    })
    .await
}

/// Uloží manifest do složky vybrané v dialogu (do podsložky podle id a verze). Vrátí cestu, nebo None.
#[tauri::command]
pub async fn publish_save_manifest<R: Runtime>(app: AppHandle<R>, subfolder: String, files: Vec<ManifestFile>) -> Result<Option<String>, String> {
    let subfolder: PathBuf = subfolder
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != ".." && part.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+')))
        .collect();
    let mut dialog = app.dialog().file();
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(folder) = dialog.blocking_pick_folder() else { return Ok(None) };
    let dir = folder.into_path().map_err(|e| e.to_string())?.join(subfolder);
    write_files(&dir, &files)?;
    Ok(Some(dir.to_string_lossy().into_owned()))
}

// ── GitHub: přihlášení pro odeslání pull requestu ────────────────────────

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    #[serde(alias = "device_code")]
    pub device_code: String,
    #[serde(alias = "user_code")]
    pub user_code: String,
    #[serde(alias = "verification_uri")]
    pub verification_uri: String,
    #[serde(default)]
    pub interval: u64,
    #[serde(alias = "expires_in", default)]
    pub expires_in: u64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DevicePoll {
    /// token, pending, slow_down, expired, denied
    pub status: String,
    pub token: Option<String>,
}

/// client_id aplikace OAuth a device_code jsou jen písmena, číslice, tečky a podtržítka.
fn github_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
}

/// POST formuláře na github.com (curl), odpověď JSON.
fn github_post(url: &str, form: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let mut command = hidden_command(&system_tool("curl.exe").to_string_lossy());
    command.args(["-sS", "--max-time", "20", "-X", "POST", "-H", "Accept: application/json"]);
    for (key, value) in form {
        command.arg("--data-urlencode").arg(format!("{key}={value}"));
    }
    command.arg(url);
    let output = process::run(command, Duration::from_secs(30))?;
    if output.code != 0 {
        return Err(format!("GitHub neodpovídá (curl {})", output.code));
    }
    serde_json::from_str(&output.stdout).map_err(|e| e.to_string())
}

/// Začne přihlášení: kód, který uživatel zadá na github.com/login/device.
#[tauri::command]
pub async fn github_device_start(client_id: String) -> Result<DeviceCode, String> {
    if !github_id(&client_id) {
        return Err("neplatné client_id".into());
    }
    process::background(move || {
        let value = github_post("https://github.com/login/device/code", &[("client_id", &client_id), ("scope", "public_repo")])?;
        if let Some(error) = value.get("error_description").or(value.get("error")).and_then(|e| e.as_str()) {
            return Err(error.to_string());
        }
        serde_json::from_value(value).map_err(|e| e.to_string())
    })
    .await
}

/// Zjistí, jestli uživatel přihlášení na GitHubu potvrdil.
#[tauri::command]
pub async fn github_device_poll(client_id: String, device_code: String) -> Result<DevicePoll, String> {
    if !github_id(&client_id) || !github_id(&device_code) {
        return Err("neplatné údaje přihlášení".into());
    }
    process::background(move || {
        let value = github_post(
            "https://github.com/login/oauth/access_token",
            &[("client_id", &client_id), ("device_code", &device_code), ("grant_type", "urn:ietf:params:oauth:grant-type:device_code")],
        )?;
        if let Some(token) = value.get("access_token").and_then(|t| t.as_str()) {
            return Ok(DevicePoll { status: "token".into(), token: Some(token.into()) });
        }
        let status = match value.get("error").and_then(|e| e.as_str()) {
            Some("authorization_pending") => "pending",
            Some("slow_down") => "slow_down",
            Some("expired_token") => "expired",
            Some("access_denied") => "denied",
            Some(other) => return Err(other.to_string()),
            None => return Err("nečekaná odpověď GitHubu".into()),
        };
        Ok(DevicePoll { status: status.into(), token: None })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pe(machine: u16) -> Vec<u8> {
        let mut head = vec![0u8; 0x200];
        head[..2].copy_from_slice(b"MZ");
        head[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        head[0x80..0x84].copy_from_slice(b"PE\0\0");
        head[0x84..0x86].copy_from_slice(&machine.to_le_bytes());
        head
    }

    #[test]
    fn architecture_from_file_name() {
        assert_eq!(architecture_from_name("app-1.2-win-x64.exe"), Some("x64"));
        assert_eq!(architecture_from_name("App_x86_64_setup.msi"), Some("x64"));
        assert_eq!(architecture_from_name("app-arm64.msix"), Some("arm64"));
        assert_eq!(architecture_from_name("app-win32-setup.exe"), Some("x86"));
        assert_eq!(architecture_from_name("setup.exe"), None);
    }

    #[test]
    fn pe_machine() {
        assert_eq!(pe_architecture(&pe(0x8664)), Some("x64"));
        assert_eq!(pe_architecture(&pe(0x014c)), Some("x86"));
        assert_eq!(pe_architecture(&pe(0xaa64)), Some("arm64"));
        assert_eq!(pe_architecture(b"not a pe file at all, just text......................................"), None);
    }

    #[test]
    fn installer_types() {
        let none = [false; 8];
        let with = |i: usize| {
            let mut f = [false; 8];
            f[i] = true;
            f
        };
        let msi = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0];
        assert_eq!(installer_type(&msi, "a.msi", &none), "msi");
        assert_eq!(installer_type(&msi, "a.msi", &with(0)), "wix");
        assert_eq!(installer_type(b"PK\x03\x04....", "a.zip", &none), "zip");
        assert_eq!(installer_type(b"PK\x03\x04....", "a.zip", &with(2)), "msix");
        assert_eq!(installer_type(b"PK\x03\x04....", "a.msixbundle", &none), "msix");
        let exe = pe(0x014c);
        assert_eq!(installer_type(&exe, "a.exe", &none), "exe");
        assert_eq!(installer_type(&exe, "a.exe", &with(4)), "burn");
        assert_eq!(installer_type(&exe, "a.exe", &with(5)), "inno");
        assert_eq!(installer_type(&exe, "a.exe", &with(7)), "nullsoft");
    }

    #[test]
    fn markers_across_chunk_boundary() {
        let dir = std::env::temp_dir().join(format!("unibox-test-scan-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("big.bin");
        // Značka přesně přes hranici dvou kusů
        let mut data = vec![b'x'; CHUNK - 5];
        data.extend_from_slice(b"Inno Setup");
        data.extend(vec![b'y'; 100]);
        std::fs::write(&path, &data).unwrap();
        let found = scan(&path, &MARKERS).unwrap();
        assert!(found[5]);
        assert!(!found[6]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn safe_names() {
        assert_eq!(file_name_from_url("https://x.org/dl/App%20Setup.exe?token=1"), "App_20Setup.exe");
        assert_eq!(file_name_from_url("https://x.org/"), "installer.bin");
        assert!(valid_manifest_name("Publisher.App.installer.yaml"));
        assert!(!valid_manifest_name("../evil.yaml"));
        assert!(!valid_manifest_name("a.exe"));
    }
}
