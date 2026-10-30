//! Stažení souboru přes curl.exe (součást Windows 10/11) s průběhem v procentech.
//!
//! Používá se pro předstažení instalátoru: winget sám stahuje přes Delivery
//! Optimization, která soubor zapisuje až na konci (průběh nejde sledovat)
//! a umí se na desítky sekund zastavit. HubGet proto instalátor stáhne sám
//! tam, kde ho winget hledá, a winget po ověření kontrolního součtu rovnou
//! instaluje.

use std::path::Path;
use std::time::Duration;

use crate::process::{self, hidden_command, system_tool, CancelToken, Output};

/// Jak stažení dopadlo.
pub enum Fetch {
    Done,
    Cancelled,
    Failed(String),
}

/// Stáhne `url` do `target` (přes dočasný soubor `.unibox-part`).
/// `on_percent` dostává celkový průběh 0–100.
pub fn fetch(url: &str, target: &Path, cancel: &CancelToken, mut on_percent: impl FnMut(f64)) -> Fetch {
    let Some(dir) = target.parent() else { return Fetch::Failed("neplatná cesta".into()) };
    if let Err(e) = std::fs::create_dir_all(dir) {
        return Fetch::Failed(e.to_string());
    }
    let part = target.with_extension("unibox-part");

    let curl = system_tool("curl.exe");
    let mut command = hidden_command(&curl.to_string_lossy());
    command.args([
        "--location",
        "--fail",
        "--show-error",
        "--retry",
        "2",
        "--connect-timeout",
        "30",
        // Zaseknuté stahování (méně než 1 kB/s po dobu minuty) vzdát – stáhne winget
        "--speed-limit",
        "1024",
        "--speed-time",
        "60",
        "--output",
    ]);
    command.arg(&part).arg(url);

    let mut largest_total = 0.0;
    let mut last_line = String::new();
    let result = process::run_streaming(command, cancel, |output| {
        if let Output::Line(line) = output {
            match meter_percent(line, &mut largest_total) {
                Some(percent) => on_percent(percent),
                None => last_line = line.to_string(),
            }
        }
    });

    match result {
        Ok(exit) if exit.cancelled => {
            let _ = std::fs::remove_file(&part);
            Fetch::Cancelled
        }
        Ok(exit) if exit.code == 0 => {
            let _ = std::fs::remove_file(target);
            match std::fs::rename(&part, target) {
                Ok(()) => Fetch::Done,
                Err(e) => Fetch::Failed(e.to_string()),
            }
        }
        Ok(_) => {
            let _ = std::fs::remove_file(&part);
            Fetch::Failed(last_line)
        }
        Err(e) => Fetch::Failed(e),
    }
}

/// Má soubor očekávaný SHA-256 (hex, na velikosti písmen nezáleží)?
pub fn sha256_matches(path: &Path, expected: &str) -> bool {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let Ok(mut file) = std::fs::File::open(path) else { return false };
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 16];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => hasher.update(&buffer[..n]),
            Err(_) => return false,
        }
    }
    let actual: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    actual.eq_ignore_ascii_case(expected)
}

/// Procenta z řádku ukazatele průběhu curl:
/// „ 11 60.45M  11  6.76M   0      0  3.23M      0   00:18   00:02   00:16  6.76M“.
/// Přesměrování (pár bajtů s „100 %“) se přeskakují – platí jen řádky
/// s největší dosud viděnou celkovou velikostí, nejméně 256 kB.
fn meter_percent(line: &str, largest_total: &mut f64) -> Option<f64> {
    let columns: Vec<&str> = line.split_whitespace().collect();
    if columns.len() < 4 {
        return None;
    }
    let percent: f64 = columns[0].parse().ok()?;
    let total = size_bytes(columns[1])?;
    if total < 256.0 * 1024.0 || total < *largest_total || !(0.0..=100.0).contains(&percent) {
        return None;
    }
    *largest_total = total;
    Some(percent)
}

/// „60.45M“ → bajty (curl používá násobky 1024: k, M, G, T).
fn size_bytes(text: &str) -> Option<f64> {
    let (number, multiplier) = match text.chars().last()? {
        'k' => (&text[..text.len() - 1], 1024.0),
        'M' => (&text[..text.len() - 1], 1024.0 * 1024.0),
        'G' => (&text[..text.len() - 1], 1024.0 * 1024.0 * 1024.0),
        'T' => (&text[..text.len() - 1], 1024.0 * 1024.0 * 1024.0 * 1024.0),
        _ => (text, 1.0),
    };
    number.parse::<f64>().ok().map(|n| n * multiplier)
}

/// Velikost souboru podle hlaviček odpovědi (s přesměrováními). Server bez
/// HEAD se zeptá na první bajt a velikost vyčte z Content-Range.
pub fn content_length(url: &str) -> Option<u64> {
    let curl = system_tool("curl.exe");
    let run = |args: &[&str]| {
        let mut command = hidden_command(&curl.to_string_lossy());
        command.args(args);
        process::run(command, Duration::from_secs(20)).ok().map(|output| output.stdout)
    };

    let head = run(&["-sIL", "--max-time", "15", url])?;
    if let Some(length) = final_header(&head, "content-length").and_then(|v| v.parse().ok()).filter(|&n| n > 0) {
        return Some(length);
    }
    let ranged = run(&["-sL", "--max-time", "15", "-r", "0-0", "-D", "-", "-o", "NUL", url])?;
    final_header(&ranged, "content-range")?.rsplit('/').next()?.trim().parse().ok()
}

/// Hlavička poslední odpovědi (po přesměrováních).
fn final_header(headers: &str, name: &str) -> Option<String> {
    let mut value = None;
    for line in headers.lines() {
        if line.starts_with("HTTP/") {
            value = None; // nová odpověď
        } else if let Some((key, rest)) = line.split_once(':') {
            if key.trim().eq_ignore_ascii_case(name) {
                value = Some(rest.trim().to_string());
            }
        }
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curl_meter() {
        let mut largest = 0.0;
        assert_eq!(meter_percent("  % Total    % Received % Xferd  Average Speed", &mut largest), None);
        // Tělo přesměrování – 145 bajtů, „100 %“ se ignoruje
        assert_eq!(meter_percent("100    145 100    145   0      0    318      0      0", &mut largest), None);
        assert_eq!(meter_percent(" 11 60.45M  11  6.76M   0      0  3.23M      0   00:18", &mut largest), Some(11.0));
        assert_eq!(meter_percent("100 60.45M 100 60.45M   0      0  5.1M      0   00:12", &mut largest), Some(100.0));
        assert_eq!(size_bytes("1234k"), Some(1234.0 * 1024.0));
    }

    #[test]
    fn final_header_after_redirect() {
        let headers = "HTTP/1.1 302 Found\r\nContent-Length: 0\r\nLocation: x\r\n\r\nHTTP/1.1 200 OK\r\ncontent-length: 46269360\r\n";
        assert_eq!(final_header(headers, "Content-Length").as_deref(), Some("46269360"));
        assert_eq!(final_header("HTTP/1.1 302 Found\r\nContent-Length: 0\r\n\r\nHTTP/1.1 200 OK\r\n", "content-length"), None);
    }
}
