//! Textová pole z informací o verzi programu (FileDescription, CompanyName,
//! ProductName, ProductVersion…) – popis programů Po spuštění (startup.rs)
//! a předvyplnění údajů při publikování aplikace (publish.rs).

use std::path::Path;

/// Hodnoty zadaných polí (ve stejném pořadí); chybějící nebo nevyplněné = None.
#[cfg(windows)]
pub fn fields(path: &Path, names: &[&str]) -> Vec<Option<String>> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};

    let none = || vec![None; names.len()];
    if !path.is_file() {
        return none();
    }
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let utf16 = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    // SAFETY: vyrovnávací paměť má velikost podle GetFileVersionInfoSizeW a VerQueryValueW
    // vrací ukazatele do ní s délkou, která v ní leží.
    unsafe {
        let size = GetFileVersionInfoSizeW(wide.as_ptr(), std::ptr::null_mut());
        if size == 0 {
            return none();
        }
        let mut data = vec![0u8; size as usize];
        if GetFileVersionInfoW(wide.as_ptr(), 0, size, data.as_mut_ptr().cast()) == 0 {
            return none();
        }
        // Ukazatel do dat a délka (u textu ve znacích, u binárních dat v bajtech)
        let query = |sub: &str| -> Option<(*const u16, usize)> {
            let mut pointer: *mut core::ffi::c_void = std::ptr::null_mut();
            let mut len = 0u32;
            let ok = VerQueryValueW(data.as_ptr().cast(), utf16(sub).as_ptr(), &mut pointer, &mut len) != 0;
            // Ukazatel míří do `data` – délka nikdy za její konec
            let start = data.as_ptr() as usize;
            let inside = (pointer as usize) >= start && (pointer as usize) < start + data.len();
            let available = (start + data.len()).saturating_sub(pointer as usize) / 2;
            (ok && inside && len > 0).then_some((pointer as *const u16, (len as usize).min(available)))
        };
        // Jazyky z tabulky překladů (dvojice WORD: jazyk, kódová stránka), pak obvyklé anglické
        let mut languages: Vec<String> = query(r"\VarFileInfo\Translation")
            .map(|(pointer, bytes)| {
                std::slice::from_raw_parts(pointer, bytes / 2).chunks_exact(2).map(|c| format!("{:04x}{:04x}", c[0], c[1])).collect()
            })
            .unwrap_or_default();
        languages.extend(["040904b0", "040904e4", "04090000"].map(String::from));
        let field = |name: &str| {
            languages.iter().find_map(|language| {
                let (pointer, chars) = query(&format!(r"\StringFileInfo\{language}\{name}"))?;
                // Délka bývá i v bajtech – text končí první nulou
                let units = std::slice::from_raw_parts(pointer, chars);
                let end = units.iter().position(|&c| c == 0).unwrap_or(units.len());
                let text = String::from_utf16_lossy(&units[..end]);
                let text = text.trim();
                // Nevyplněná šablona projektu („TODO: <File description>“) není údaj
                (!text.is_empty() && !text.starts_with("TODO")).then(|| text.to_string())
            })
        };
        names.iter().map(|name| field(name)).collect()
    }
}

#[cfg(not(windows))]
pub fn fields(_path: &Path, names: &[&str]) -> Vec<Option<String>> {
    vec![None; names.len()]
}
