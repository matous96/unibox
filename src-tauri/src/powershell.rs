//! Trvale běžící Windows PowerShell (pro modul Microsoft.WinGet.Client).
//!
//! Start PowerShellu, načtení modulu a otevření zdroje winget trvá několik
//! sekund. Jeden proces na pozadí, který čte příkazy ze stdin, zkrátí další
//! výpisy a hledání na zlomky sekundy. Příkaz se posílá jako řádek
//! `<id> <skript v base64>`, odpověď přijde jako jeden řádek
//! `@@unibox <id> ok|err <JSON>`; jiný výstup (varování modulu…) se ignoruje.
//! Příkazy se zpracovávají jeden po druhém.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::process::{hidden_command, system_tool};

/// Smyčka běžící v PowerShellu: přečte příkaz, spustí ho a výsledek vrátí jako JSON.
const HOST_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$stdin = New-Object System.IO.StreamReader ([Console]::OpenStandardInput()), $utf8
while ($true) {
  $line = $stdin.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Split(' ', 2)
  try {
    $code = $utf8.GetString([Convert]::FromBase64String($parts[1]))
    $result = @(& ([scriptblock]::Create($code)))
    $json = ConvertTo-Json -InputObject $result -Compress -Depth 5
    [Console]::Out.WriteLine('@@unibox ' + $parts[0] + ' ok ' + $json)
  } catch {
    $message = ConvertTo-Json -InputObject ([string]$_.Exception.Message) -Compress
    [Console]::Out.WriteLine('@@unibox ' + $parts[0] + ' err ' + $message)
  }
  [Console]::Out.Flush()
}
"#;

const MARKER: &str = "@@unibox ";

/// Chyba vrácená, když se příkaz nespustil, protože ho nahradil novější (hledání).
pub const SUPERSEDED: &str = "superseded";

struct Host {
    child: Child,
    stdin: ChildStdin,
    replies: mpsc::Receiver<String>,
    next_id: u64,
}

enum CallError {
    /// Skript skončil výjimkou – PowerShell běží dál.
    Script(String),
    /// PowerShell neodpovídá nebo skončil – spustí se znovu.
    Host(String),
}

static HOST: Mutex<Option<Host>> = Mutex::new(None);

/// Cesta k Windows PowerShellu 5.1.
pub fn powershell_exe() -> PathBuf {
    system_tool(r"WindowsPowerShell\v1.0\powershell.exe")
}

/// Text jako výraz PowerShellu – předá se v base64, takže na uvozovkách nezáleží.
pub fn ps_string(value: &str) -> String {
    format!("([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{}')))", BASE64.encode(value))
}

/// Spustí skript a vrátí jeho výstup jako pole JSON.
pub fn call(script: &str, timeout: Duration) -> Result<Value, String> {
    call_unless(script, timeout, || false)
}

/// Jako [`call`], ale pokud `superseded()` po získání PowerShellu vrátí true,
/// skript se nespustí (zastaralé hledání, když uživatel mezitím píše dál).
pub fn call_unless(script: &str, timeout: Duration, superseded: impl Fn() -> bool) -> Result<Value, String> {
    let mut guard = HOST.lock().unwrap_or_else(|e| e.into_inner());
    if superseded() {
        return Err(SUPERSEDED.into());
    }
    if guard.is_none() {
        *guard = Some(Host::start()?);
    }
    let host = guard.as_mut().expect("PowerShell běží");
    match host.request(script, timeout) {
        Ok(value) => Ok(value),
        Err(CallError::Script(message)) => Err(message),
        Err(CallError::Host(message)) => {
            if let Some(mut host) = guard.take() {
                let _ = host.child.kill();
            }
            Err(message)
        }
    }
}

impl Host {
    fn start() -> Result<Host, String> {
        // -EncodedCommand čeká skript v UTF-16LE zakódovaný base64
        let utf16: Vec<u8> = HOST_SCRIPT.encode_utf16().flat_map(u16::to_le_bytes).collect();
        let exe = powershell_exe();
        let mut child = hidden_command(&exe.to_string_lossy())
            .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"])
            .args(["-EncodedCommand", &BASE64.encode(utf16)])
            .stdin(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("PowerShell se nepodařilo spustit: {e}"))?;
        let stdin = child.stdin.take().ok_or("PowerShell nemá vstup")?;
        let stdout = child.stdout.take().ok_or("PowerShell nemá výstup")?;

        let (tx, replies) = mpsc::channel();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = Vec::new();
            loop {
                line.clear();
                match reader.read_until(b'\n', &mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let text = String::from_utf8_lossy(&line);
                        if let Some(reply) = text.trim_end().strip_prefix(MARKER) {
                            if tx.send(reply.to_string()).is_err() {
                                break;
                            }
                        }
                    }
                }
            }
        });
        Ok(Host { child, stdin, replies, next_id: 0 })
    }

    fn request(&mut self, script: &str, timeout: Duration) -> Result<Value, CallError> {
        self.next_id += 1;
        let id = self.next_id.to_string();
        writeln!(self.stdin, "{id} {}", BASE64.encode(script))
            .and_then(|_| self.stdin.flush())
            .map_err(|_| CallError::Host("PowerShell neočekávaně skončil".into()))?;

        let deadline = Instant::now() + timeout;
        loop {
            let reply = match self.replies.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(reply) => reply,
                Err(mpsc::RecvTimeoutError::Timeout) => return Err(CallError::Host("PowerShell neodpověděl včas".into())),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(CallError::Host("PowerShell neočekávaně skončil".into()))
                }
            };
            let mut parts = reply.splitn(3, ' ');
            let (Some(reply_id), Some(status)) = (parts.next(), parts.next()) else { continue };
            if reply_id != id {
                continue; // odpověď na dřívější příkaz, který vypršel
            }
            let value: Value = serde_json::from_str(parts.next().unwrap_or("null"))
                .map_err(|e| CallError::Host(format!("Neplatná odpověď PowerShellu: {e}")))?;
            return match status {
                "ok" => Ok(value),
                _ => Err(CallError::Script(value.as_str().unwrap_or_default().to_string())),
            };
        }
    }
}
