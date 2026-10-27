//! Sledování instalace (snímek systému) – podklad pro 100% čisté odinstalování.
//!
//! Před instalací (Nastavení → Sledovat instalace, nebo „Nainstalovat se
//! sledováním“) se pořídí snímek míst, kam instalátory zapisují, a po
//! úspěšné instalaci druhý. Rozdíl – nové složky, zástupci, klíče registru,
//! záznamy „Programy a funkce“ a hodnoty Run – se uloží k aplikaci
//! (`install-traces/<hash>.json` ve složce aplikace; při aktualizaci se doplní).
//!
//! Snímek zahrnuje jen položky, které úklid zbytků umí bezpečně smazat
//! (stejná pravidla jako leftovers.rs): složky a zástupce nejvýš dvě úrovně
//! pod Program Files, ProgramData, AppData, nabídkou Start a plochou, klíče
//! `Software\X` / `Software\Vendor\X`, záznamy Uninstall a hodnoty v klíčích
//! Run – ne obsah souborů. Ze zaznamenaného se ukládá jen nejvyšší nová
//! položka (nová složka vydavatele zahrne i aplikaci v ní).
//!
//! Po odinstalaci najde `leftover_scan` zaznamenané položky, které ještě
//! existují, a nabídne je ke smazání spolu s ostatními zbytky (Koš, záloha
//! registru, povýšený pomocník). Záznam, ze kterého už nic nezbylo, se smaže.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::arp;
use crate::leftovers::{self, registry, Item, Kind, REGISTRY_ROOTS, RUN_KEYS, UNINSTALL_KEYS};
use crate::process::background;

/// Snímek: cesta malými písmeny → druh a původní zápis.
type Snapshot = HashMap<String, (Kind, String)>;

/// Rozpracované snímky podle tokenu (instalace ještě běží).
static SNAPSHOTS: Mutex<Option<HashMap<u64, Snapshot>>> = Mutex::new(None);
static NEXT_TOKEN: AtomicU64 = AtomicU64::new(1);

/// Uložený záznam instalace jedné aplikace.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trace {
    /// „zdroj:id balíčku“ („winget:Discord.Discord“).
    key: String,
    app_name: String,
    created_at: u64,
    updated_at: u64,
    items: Vec<Item>,
}

/// Přehled záznamu pro Nastavení.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceSummary {
    key: String,
    app_name: String,
    updated_at: u64,
    folders: usize,
    keys: usize,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Složka se záznamy instalací.
pub fn traces_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_local_data_dir().ok().map(|dir| dir.join("install-traces"))
}

fn trace_file(dir: &Path, key: &str) -> PathBuf {
    let hash: String = Sha256::digest(key.to_lowercase().as_bytes()).iter().take(12).map(|b| format!("{b:02x}")).collect();
    dir.join(format!("{hash}.json"))
}

fn load(file: &Path) -> Option<Trace> {
    serde_json::from_slice(&std::fs::read(file).ok()?).ok()
}

// ── Snímek ───────────────────────────────────────────────────────────────

/// Pořídí snímek míst, kam instalátory zapisují (jen názvy, žádný obsah).
fn capture() -> Snapshot {
    let mut snapshot = Snapshot::new();
    let mut add = |kind: Kind, path: String| {
        snapshot.insert(path.to_lowercase(), (kind, path));
    };
    for root in leftovers::roots(true) {
        if root.shortcuts {
            leftovers::shortcuts(&root.dir).into_iter().for_each(|f| add(Kind::File, f.to_string_lossy().into_owned()));
        }
        for dir in leftovers::subdirectories(&root.dir) {
            add(Kind::Folder, dir.to_string_lossy().into_owned());
            // Do sdílených a systémových složek (Microsoft, Packages, Temp…) se nenahlíží
            if leftovers::protected(&leftovers::folder_key(&dir)) {
                continue;
            }
            leftovers::subdirectories(&dir).into_iter().for_each(|sub| add(Kind::Folder, sub.to_string_lossy().into_owned()));
            if root.shortcuts {
                leftovers::shortcuts(&dir).into_iter().for_each(|f| add(Kind::File, f.to_string_lossy().into_owned()));
            }
        }
    }
    for (root, _) in REGISTRY_ROOTS {
        for sub in registry::subkeys(root) {
            let path = format!(r"{root}\{sub}");
            let skip = leftovers::protected(&arp::name_key(&sub));
            add(Kind::Registry, path.clone());
            if !skip {
                registry::subkeys(&path).into_iter().for_each(|sub| add(Kind::Registry, format!(r"{path}\{sub}")));
            }
        }
    }
    for (key, _) in UNINSTALL_KEYS {
        registry::subkeys(key).into_iter().for_each(|sub| add(Kind::Registry, format!(r"{key}\{sub}")));
    }
    for (key, _) in RUN_KEYS {
        registry::value_names(key).into_iter().for_each(|name| add(Kind::Value, format!("{key}|{name}")));
    }
    snapshot
}

/// Nové položky (jen nejvyšší) z rozdílu dvou snímků, které úklid smí smazat.
fn diff(before: &Snapshot, after: &Snapshot) -> Vec<Item> {
    let mut added: Vec<&(Kind, String)> = after.iter().filter(|(key, _)| !before.contains_key(*key)).map(|(_, v)| v).collect();
    added.sort_by_key(|(_, path)| path.len());
    let mut result: Vec<Item> = Vec::new();
    for (kind, path) in added {
        let lower = path.to_lowercase();
        let covered = result
            .iter()
            .any(|i| matches!(i.kind, Kind::Folder | Kind::Registry) && lower.starts_with(&format!("{}\\", i.path.to_lowercase())));
        let item = Item { kind: *kind, path: path.clone() };
        if !covered && leftovers::allowed(&item) {
            result.push(item);
        }
    }
    result
}

/// Spojí zaznamenané položky (bez opakování, nejvyšší vyhrává).
fn merge(existing: Vec<Item>, new: Vec<Item>) -> Vec<Item> {
    let mut items = existing;
    for item in new {
        let lower = item.path.to_lowercase();
        if items.iter().any(|i| i.path.to_lowercase() == lower || lower.starts_with(&format!("{}\\", i.path.to_lowercase()))) {
            continue;
        }
        items.push(item);
    }
    items
}

// ── Příkazy ──────────────────────────────────────────────────────────────

/// Snímek před instalací; vrátí token pro [`trace_end`].
#[tauri::command]
pub async fn trace_begin() -> Result<u64, String> {
    let snapshot = background(|| Ok(capture())).await?;
    let token = NEXT_TOKEN.fetch_add(1, Ordering::SeqCst);
    SNAPSHOTS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).insert(token, snapshot);
    Ok(token)
}

/// Instalace skončila jinak než úspěchem – snímek zahodit.
#[tauri::command]
pub fn trace_discard(token: u64) {
    if let Some(map) = SNAPSHOTS.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        map.remove(&token);
    }
}

/// Snímek po úspěšné instalaci: rozdíl uloží (doplní) k aplikaci `key`.
/// Vrátí počet nově zaznamenaných položek.
#[tauri::command]
pub async fn trace_end(app: AppHandle, token: u64, key: String, app_name: String) -> Result<usize, String> {
    let before = SNAPSHOTS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_mut()
        .and_then(|map| map.remove(&token))
        .ok_or("snímek před instalací chybí")?;
    let dir = traces_dir(&app).ok_or("úložiště aplikace není dostupné")?;
    background(move || {
        let added = diff(&before, &capture());
        let file = trace_file(&dir, &key);
        let existing = load(&file);
        if added.is_empty() && existing.is_none() {
            return Ok(0);
        }
        let count = added.len();
        let created_at = existing.as_ref().map_or_else(now, |t| t.created_at);
        let items = merge(existing.map(|t| t.items).unwrap_or_default(), added);
        let trace = Trace { key, app_name, created_at, updated_at: now(), items };
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(&file, serde_json::to_vec_pretty(&trace).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        Ok(count)
    })
    .await
}

/// Zaznamenané instalace (Nastavení).
#[tauri::command]
pub async fn install_traces(app: AppHandle) -> Result<Vec<TraceSummary>, String> {
    let Some(dir) = traces_dir(&app) else { return Ok(Vec::new()) };
    background(move || {
        let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(Vec::new()) };
        let mut traces: Vec<TraceSummary> = entries
            .flatten()
            .filter_map(|f| load(&f.path()))
            .map(|t| TraceSummary {
                folders: t.items.iter().filter(|i| matches!(i.kind, Kind::Folder | Kind::File)).count(),
                keys: t.items.iter().filter(|i| matches!(i.kind, Kind::Registry | Kind::Value)).count(),
                key: t.key,
                app_name: t.app_name,
                updated_at: t.updated_at,
            })
            .collect();
        traces.sort_by(|a, b| a.app_name.to_lowercase().cmp(&b.app_name.to_lowercase()));
        Ok(traces)
    })
    .await
}

/// Zapomene záznam instalace (nic na disku ani v registru nemaže).
#[tauri::command]
pub async fn forget_trace(app: AppHandle, key: String) -> Result<(), String> {
    let dir = traces_dir(&app).ok_or("úložiště aplikace není dostupné")?;
    let file = trace_file(&dir, &key);
    if file.exists() {
        std::fs::remove_file(file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Zaznamenané položky aplikace, které ještě existují (pro hledání zbytků).
/// Záznam, ze kterého už nic nezbylo, smaže.
pub fn remaining_items(dir: &Path, key: &str) -> Vec<Item> {
    let file = trace_file(dir, key);
    let Some(trace) = load(&file) else { return Vec::new() };
    let remaining: Vec<Item> = trace.items.into_iter().filter(leftovers::exists).collect();
    if remaining.is_empty() {
        let _ = std::fs::remove_file(&file);
    }
    remaining
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(items: &[(Kind, &str)]) -> Snapshot {
        items.iter().map(|(kind, path)| (path.to_lowercase(), (*kind, path.to_string()))).collect()
    }

    #[test]
    fn diff_keeps_only_topmost_new_allowed_items() {
        let before = snapshot(&[(Kind::Registry, r"HKCU\Software\Existing"), (Kind::Registry, r"HKCU\Software\Microsoft")]);
        let after = snapshot(&[
            (Kind::Registry, r"HKCU\Software\Existing"),
            (Kind::Registry, r"HKCU\Software\Microsoft"),
            // Nový vydavatel i aplikace v něm → jen vydavatel
            (Kind::Registry, r"HKCU\Software\Acme"),
            (Kind::Registry, r"HKCU\Software\Acme\Rocket"),
            // Nová aplikace pod existujícím klíčem
            (Kind::Registry, r"HKCU\Software\Existing\Rocket"),
            // Chráněné názvy se nezaznamenají
            (Kind::Registry, r"HKCU\Software\Classes"),
            (Kind::Registry, r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Rocket"),
            (Kind::Value, r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run|Rocket"),
            // Hodnota mimo klíč Run se nezaznamená
            (Kind::Value, r"HKCU\Software\Acme|Setting"),
        ]);
        let mut paths: Vec<String> = diff(&before, &after).into_iter().map(|i| i.path).collect();
        paths.sort();
        assert_eq!(
            paths,
            vec![
                r"HKCU\Software\Acme".to_string(),
                r"HKCU\Software\Existing\Rocket".to_string(),
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run|Rocket".to_string(),
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Rocket".to_string(),
            ]
        );
    }

    #[test]
    fn merge_skips_duplicates_and_children() {
        let item = |path: &str| Item { kind: Kind::Registry, path: path.into() };
        let merged = merge(
            vec![item(r"HKCU\Software\Acme")],
            vec![item(r"hkcu\software\acme"), item(r"HKCU\Software\Acme\Rocket"), item(r"HKCU\Software\Other")],
        );
        assert_eq!(merged.iter().map(|i| i.path.as_str()).collect::<Vec<_>>(), vec![r"HKCU\Software\Acme", r"HKCU\Software\Other"]);
    }

    #[test]
    fn trace_file_name_ignores_case() {
        let dir = Path::new(r"C:\traces");
        assert_eq!(trace_file(dir, "winget:Discord.Discord"), trace_file(dir, "WINGET:discord.discord"));
        assert_ne!(trace_file(dir, "winget:A"), trace_file(dir, "winget:B"));
    }
}
