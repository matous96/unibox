//! Přihlášení přes OAuth v systémovém prohlížeči (doporučení RFC 8252 pro
//! nativní aplikace).
//!
//! 1. `oauth_listen` – HubGet začne naslouchat na `http://127.0.0.1:<port>`
//!    (jen místní smyčka, z jiného počítače nedostupné) a vrátí port.
//! 2. Frontend otevře v prohlížeči přihlášení u poskytovatele (Supabase →
//!    GitHub / Google) s návratovou adresou `http://127.0.0.1:<port>/auth/callback`.
//! 3. `oauth_wait` – počká, až se prohlížeč vrátí s jednorázovým kódem, ukáže
//!    v něm stránku „hotovo“ a kód předá frontendu, který ho vymění za relaci
//!    (PKCE – kód bez tajného ověřovače uloženého v aplikaci nikomu nepomůže).
//!
//! Heslo ani token poskytovatele aplikace nikdy nevidí.

use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Runtime};

/// Pevné porty – Supabase je musí mít v seznamu povolených návratových adres
/// (Authentication → URL Configuration → Redirect URLs). Druhý a třetí jen
/// pro případ, že první drží jiný program.
const PORTS: [u16; 3] = [47823, 47824, 47825];
const CALLBACK_PATH: &str = "/auth/callback";
/// Jak dlouho čekat na dokončení přihlášení v prohlížeči.
const WAIT_LIMIT: Duration = Duration::from_secs(5 * 60);

static LISTENER: Mutex<Option<TcpListener>> = Mutex::new(None);
static CANCELLED: AtomicBool = AtomicBool::new(false);

/// Výsledek návratu z prohlížeče (parametry z adresy).
#[derive(Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Callback {
    pub code: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// Začne naslouchat a vrátí port pro návratovou adresu.
#[tauri::command]
pub fn oauth_listen() -> Result<u16, String> {
    let mut slot = LISTENER.lock().unwrap_or_else(|e| e.into_inner());
    *slot = None; // předchozí nedokončené přihlášení
    CANCELLED.store(false, Ordering::SeqCst);
    for port in PORTS {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            listener.set_nonblocking(true).map_err(|e| e.to_string())?;
            *slot = Some(listener);
            return Ok(port);
        }
    }
    Err(format!("porty {PORTS:?} jsou obsazené jiným programem"))
}

/// Počká na návrat z prohlížeče; potom vrátí okno HubGetu do popředí.
#[tauri::command]
pub async fn oauth_wait<R: Runtime>(app: AppHandle<R>) -> Result<Callback, String> {
    let listener = LISTENER.lock().unwrap_or_else(|e| e.into_inner()).take().ok_or("přihlášení nezačalo")?;
    let callback = tauri::async_runtime::spawn_blocking(move || wait(&listener))
        .await
        .map_err(|e| e.to_string())??;
    crate::tray::show_main_window(&app);
    Ok(callback)
}

/// Zruší čekání (uživatel zavřel dialog přihlášení).
#[tauri::command]
pub fn oauth_cancel() {
    CANCELLED.store(true, Ordering::SeqCst);
    *LISTENER.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

fn wait(listener: &TcpListener) -> Result<Callback, String> {
    let started = Instant::now();
    loop {
        if CANCELLED.load(Ordering::SeqCst) {
            return Err("cancelled".into());
        }
        if started.elapsed() > WAIT_LIMIT {
            return Err("timeout".into());
        }
        match listener.accept() {
            // Jiné požadavky (favicon, předběžná spojení prohlížeče) se odbydou a čeká se dál
            Ok((stream, _)) => {
                if let Some(callback) = answer(stream) {
                    return Ok(callback);
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Přečte požadavek; je-li to návrat z přihlášení, odpoví stránkou „hotovo“.
fn answer(mut stream: TcpStream) -> Option<Callback> {
    // Přijaté spojení ve Windows dědí neblokující režim naslouchání
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    let mut request_line = String::new();
    BufReader::new(&stream).read_line(&mut request_line).ok()?;

    let callback = parse_request_line(&request_line);
    let (status, body) = match &callback {
        Some(c) if c.code.is_some() => ("200 OK", page(true)),
        Some(_) => ("200 OK", page(false)),
        None => ("404 Not Found", String::new()),
    };
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    callback
}

/// „GET /auth/callback?code=…&state=… HTTP/1.1“ → parametry; jiná cesta → None.
fn parse_request_line(line: &str) -> Option<Callback> {
    let mut parts = line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let url = tauri::Url::parse(&format!("http://127.0.0.1{}", parts.next()?)).ok()?;
    if url.path() != CALLBACK_PATH {
        return None;
    }
    let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.into_owned());
    Some(Callback { code: param("code"), error: param("error"), error_description: param("error_description") })
}

/// Stránka v prohlížeči po návratu (česky i anglicky – jazyk aplikace backend nezná).
fn page(success: bool) -> String {
    let (title, text) = if success {
        ("Přihlášení dokončeno · Signed in", "Můžete se vrátit do HubGetu.<br>You can return to HubGet.")
    } else {
        ("Přihlášení se nepovedlo · Sign-in failed", "Vraťte se do HubGetu a zkuste to znovu.<br>Return to HubGet and try again.")
    };
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>HubGet</title><style>\
         body{{font-family:'Segoe UI',system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0f1115;color:#e7e9ee}}\
         main{{text-align:center}}h1{{font-size:22px;margin:0 0 8px}}p{{color:#9aa1ad;line-height:1.6}}\
         </style></head><body><main><h1>{title}</h1><p>{text}</p></main></body></html>"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_callback() {
        let ok = parse_request_line("GET /auth/callback?code=abc-123&state=x HTTP/1.1\r\n").unwrap();
        assert_eq!(ok.code.as_deref(), Some("abc-123"));
        let denied = parse_request_line("GET /auth/callback?error=access_denied&error_description=User%20denied HTTP/1.1").unwrap();
        assert_eq!(denied.error.as_deref(), Some("access_denied"));
        assert_eq!(denied.error_description.as_deref(), Some("User denied"));
        assert_eq!(parse_request_line("GET /favicon.ico HTTP/1.1"), None);
        assert_eq!(parse_request_line("POST /auth/callback?code=x HTTP/1.1"), None);
    }

    #[test]
    fn answers_over_loopback() {
        let port = oauth_listen().unwrap();
        let client = std::thread::spawn(move || {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream.write_all(b"GET /auth/callback?code=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
            let mut response = String::new();
            std::io::Read::read_to_string(&mut stream, &mut response).unwrap();
            response
        });
        let listener = LISTENER.lock().unwrap().take().unwrap();
        let callback = wait(&listener).unwrap();
        assert_eq!(callback.code.as_deref(), Some("xyz"));
        assert!(client.join().unwrap().starts_with("HTTP/1.1 200 OK"));
    }
}
