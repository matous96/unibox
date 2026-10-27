// Vývojový certifikát pro vyzkoušení podpisu kódu (scripts/sign.mjs). Je self-signed:
// Windows mu nedůvěřuje a varování SmartScreen u ostatních neodstraní – k tomu je
// potřeba certifikát od důvěryhodné certifikační autority (README → Podpis kódu).
// Vytvoří soubor .pfx a jeho veřejnou část .cer; do úložiště certifikátů Windows
// nic nezapisuje. Nakonec vypíše, jak ho při sestavení použít.
//
//   node scripts/dev-certificate.mjs [složka]   (výchozí %USERPROFILE%\.tauri)
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? join(homedir(), ".tauri"));
const pfx = join(dir, "unibox-dev-signing.pfx");
const cer = join(dir, "unibox-dev-signing.cer");
if (existsSync(pfx)) {
  console.error(`Vývojový certifikát už existuje: ${pfx}\nChcete-li nový, starý nejdřív smažte.`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
const password = randomBytes(18).toString("base64url");

// Certifikát vytvoří .NET ve Windows PowerShellu (CertificateRequest) – v paměti, bez úložiště.
// Cesty a heslo jdou přes proměnné prostředí, ne v příkazové řádce.
const script = `
$ErrorActionPreference = 'Stop'
$rsa = [System.Security.Cryptography.RSA]::Create(3072)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
  'CN=Unibox (dev), O=Unibox', $rsa,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
# Jen digitální podpis, rozšířené použití „podepisování kódu“, není certifikační autorita
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
  [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature, $true))
$usages = [System.Security.Cryptography.OidCollection]::new()
[void]$usages.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usages, $false))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($request.PublicKey, $false))
$cert = $request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5), [DateTimeOffset]::Now.AddYears(2))
[IO.File]::WriteAllBytes($env:UNIBOX_DEV_PFX, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $env:UNIBOX_DEV_PASSWORD))
[IO.File]::WriteAllBytes($env:UNIBOX_DEV_CER, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
$cert.Thumbprint
`;
const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
  encoding: "utf8",
  env: { ...process.env, UNIBOX_DEV_PFX: pfx, UNIBOX_DEV_CER: cer, UNIBOX_DEV_PASSWORD: password },
});
const thumbprint = result.stdout?.trim().split(/\r?\n/).pop();
if (result.status !== 0 || !existsSync(pfx)) {
  console.error("Certifikát se nepodařilo vytvořit:", (result.stderr || result.stdout || result.error?.message || "").trim());
  process.exit(1);
}

console.log(`Vývojový certifikát je připravený (otisk ${thumbprint}, platí 2 roky):
  ${pfx}  – certifikát s klíčem pro podpis
  ${cer}  – jen veřejná část (důvěra na testovacím počítači, README → Podpis kódu)

Podepsané sestavení (PowerShell):
  $env:UNIBOX_SIGN_PFX = "${pfx}"
  $env:UNIBOX_SIGN_PFX_PASSWORD = "${password}"
  pnpm release -- --no-bump

Heslo se nikam neukládá – poznamenejte si ho. Certifikát je jen na zkoušku:
Windows ho za důvěryhodný nepovažuje a SmartScreen u ostatních nevypne.`);
