//! Ukládání souborů přes systémový dialog „Uložit jako“ (export seznamu
//! aplikací, sady balíčků, skriptu, protokolů).
//!
//! Zapisuje se jen do souboru, který uživatel v dialogu sám vybral –
//! frontend tak nedostane obecný přístup k disku.

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

/// Uloží text do souboru vybraného v dialogu. Vrátí cestu, nebo None,
/// když uživatel dialog zavřel.
#[tauri::command]
pub async fn save_text_file<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
    content: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let extensions: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let mut dialog = app.dialog().file().set_file_name(&file_name);
    if !extensions.is_empty() {
        dialog = dialog.add_filter(&filter_name, &extensions);
    }
    // Dialog patří k oknu Uniboxu (modální, nad oknem)
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    // Async příkaz běží mimo hlavní vlákno – blokující dialog tu nevadí
    let Some(path) = dialog.blocking_save_file() else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
