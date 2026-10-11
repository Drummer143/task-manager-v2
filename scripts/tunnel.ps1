# SSH tunnel to the VPS, so services can run locally against its databases.
#
# Usage:
#   .\scripts\tunnel.ps1                 # host from TUNNEL_SSH_HOST in .env.tunnel
#   .\scripts\tunnel.ps1 root@1.2.3.4
#
# Forwards (the VPS publishes these on its loopback only, see docker/docker-compose.prod.yml):
#   localhost:5432  -> postgres
#   localhost:6379  -> redis
#   localhost:9000  -> authentik
#
# Then start a service in another terminal with .\scripts\dev-tunnel.ps1. Ctrl+C stops the tunnel.

param(
    [string]$SshHost
)

$envFile = Join-Path $PSScriptRoot "..\.env.tunnel"

if (-not $SshHost -and (Test-Path $envFile)) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*TUNNEL_SSH_HOST\s*=' } | Select-Object -First 1
    if ($line) { $SshHost = ($line -split "=", 2)[1].Trim().Trim('"', "'") }
}

if (-not $SshHost) {
    Write-Host "ERROR: pass the host (.\scripts\tunnel.ps1 user@host) or set TUNNEL_SSH_HOST in .env.tunnel." -ForegroundColor Red
    exit 1
}

Write-Host "Starting SSH tunnel to $SshHost ..." -ForegroundColor Cyan
Write-Host "  localhost:5432  -> postgres"
Write-Host "  localhost:6379  -> redis"
Write-Host "  localhost:9000  -> authentik"
Write-Host "  localhost:5672  -> rabbitmq"
Write-Host ""
Write-Host "These are the production databases. Press Ctrl+C to stop." -ForegroundColor Yellow

# ExitOnForwardFailure: fail loudly when a local port is taken (e.g. a local postgres) instead of
# silently tunnelling the rest. ServerAlive*: notice a dead connection instead of hanging.
ssh -N `
    -o ExitOnForwardFailure=yes `
    -o ServerAliveInterval=30 `
    -o ServerAliveCountMax=3 `
    -L 5432:127.0.0.1:5432 `
    -L 6379:127.0.0.1:6379 `
    -L 9000:127.0.0.1:9000 `
    -L 5672:127.0.0.1:5672 `
    $SshHost
