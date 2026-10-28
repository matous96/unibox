//! Šifrované úložiště přihlášení (relace Supabase, ověřovač PKCE).
//!
//! Hodnoty šifruje Windows DPAPI (`CryptProtectData`) klíčem účtu Windows –
//! jiný uživatel ani jiný počítač je nepřečte – a ukládají se do souborů
//! v `%LOCALAPPDATA%\<identifikátor aplikace>\secure\`. Do localStorage WebView
//! se token nedostane. Název souboru je SHA-256 klíče (klíč může obsahovat
//! znaky, které v názvu souboru být nesmí).

use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

fn path_of<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("secure");
    let name: String = Sha256::digest(key.as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
    Ok(dir.join(format!("{name}.bin")))
}

// Soubory a DPAPI mimo vlákno okna – synchronní příkaz by běžel na hlavním vlákně

#[tauri::command]
pub async fn secure_get<R: Runtime>(app: AppHandle<R>, key: String) -> Result<Option<String>, String> {
    let path = path_of(&app, &key)?;
    crate::process::background(move || {
        let Ok(encrypted) = std::fs::read(&path) else { return Ok(None) };
        // Soubor, který nejde rozšifrovat (jiný účet, poškození), jako by nebyl
        match unprotect(&encrypted) {
            Ok(plain) => Ok(String::from_utf8(plain).ok()),
            Err(_) => {
                let _ = std::fs::remove_file(&path);
                Ok(None)
            }
        }
    })
    .await
}

#[tauri::command]
pub async fn secure_set<R: Runtime>(app: AppHandle<R>, key: String, value: String) -> Result<(), String> {
    let path = path_of(&app, &key)?;
    crate::process::background(move || {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, protect(value.as_bytes())?).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn secure_remove<R: Runtime>(app: AppHandle<R>, key: String) -> Result<(), String> {
    let path = path_of(&app, &key)?;
    crate::process::background(move || match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    })
    .await
}

#[cfg(windows)]
fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    dpapi(data, true)
}

#[cfg(windows)]
fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    dpapi(data, false)
}

/// Zašifruje / rozšifruje data klíčem přihlášeného uživatele Windows.
#[cfg(windows)]
fn dpapi(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    // SAFETY: vstup ukazuje na platný řez po dobu volání; výstup alokuje
    // systém (LocalAlloc), zkopíruje se a uvolní přes LocalFree.
    unsafe {
        let ok = if encrypt {
            CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        };
        if ok == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as _);
        Ok(result)
    }
}

#[cfg(not(windows))]
fn protect(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("jen ve Windows".into())
}

#[cfg(not(windows))]
fn unprotect(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("jen ve Windows".into())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn dpapi_round_trip() {
        let secret = r#"{"access_token":"eyJ…","refresh_token":"abc"}"#.as_bytes();
        let encrypted = protect(secret).unwrap();
        assert_ne!(encrypted, secret);
        assert_eq!(unprotect(&encrypted).unwrap(), secret);
        assert!(unprotect(b"neni to DPAPI").is_err());
    }
}
