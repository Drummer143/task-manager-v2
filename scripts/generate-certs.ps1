# Certificates for the frontend dev server, which then serves https://localhost:1346.
#
# authentik only redirects back to registered URLs, and the dev one is https. With mkcert the
# certificate is trusted by the browser; the openssl fallback works but shows a warning.
#
# Usage: .\scripts\generate-certs.ps1   (writes certs/, which git ignores)

$ErrorActionPreference = "Stop"

$certsDir = Join-Path (Split-Path $PSScriptRoot) "certs"
New-Item -ItemType Directory -Force -Path $certsDir | Out-Null

$keyPath = Join-Path $certsDir "localhost-key.pem"
$certPath = Join-Path $certsDir "localhost.pem"

if (Get-Command mkcert -ErrorAction SilentlyContinue) {
    Write-Host "Using mkcert to generate locally-trusted certificates..."
    # Installs mkcert's root CA once; it reports progress on stderr
    $ErrorActionPreference = "Continue"
    & mkcert -install 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    & mkcert -key-file $keyPath -cert-file $certPath localhost 127.0.0.1 "::1"
} else {
    Write-Host "mkcert not found, falling back to openssl..."
    openssl req -x509 -newkey rsa:2048 -nodes `
        -keyout $keyPath `
        -out $certPath `
        -days 365 `
        -subj "/CN=localhost" `
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"
    Write-Host ""
    Write-Host "WARNING: self-signed certificate; the browser will show a security warning." -ForegroundColor Yellow
    Write-Host "Install mkcert to avoid it: https://github.com/FiloSottile/mkcert#installation"
}

Write-Host ""
Write-Host "Certificates written to $certsDir"
