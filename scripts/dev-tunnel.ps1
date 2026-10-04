# Runs one service locally against the VPS databases, through the SSH tunnel.
#
# Start the tunnel first, in a separate terminal:
#   .\scripts\tunnel.ps1
#
# Usage:
#   .\scripts\dev-tunnel.ps1 main        # main-service
#   .\scripts\dev-tunnel.ps1 storage     # storage-service
#   .\scripts\dev-tunnel.ps1 socket      # socket-service (Elixir)
#   .\scripts\dev-tunnel.ps1 frontend    # frontend dev server
#
# Settings come from .env.tunnel (copy .env.tunnel.example). Variables already set in the shell
# win over the file.

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("main", "storage", "socket", "frontend")]
    [string]$Service
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.tunnel"

if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env.tunnel not found. Copy .env.tunnel.example and fill in your values." -ForegroundColor Red
    exit 1
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $name = $parts[0].Trim()
            $value = $parts[1].Trim().Trim('"', "'")
            if (-not [System.Environment]::GetEnvironmentVariable($name, "Process")) {
                [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    }
}

function Test-Port([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        return $client.ConnectAsync("127.0.0.1", $Port).Wait(1000)
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

# Fail early with a clear message instead of a connection error deep in the service's startup
$needs = @{ "main" = @(5432); "storage" = @(5432, 6379, 9000); "socket" = @(); "frontend" = @() }
foreach ($port in $needs[$Service]) {
    if (-not (Test-Port $port)) {
        Write-Host "ERROR: nothing listens on localhost:$port. Is .\scripts\tunnel.ps1 running?" -ForegroundColor Red
        exit 1
    }
}

Set-Location $root

switch ($Service) {
    "main" {
        if ($env:RUN_MIGRATIONS -ne "false") {
            Write-Host "WARNING: RUN_MIGRATIONS is not false: migrations of this branch will be applied to the VPS database." -ForegroundColor Yellow
        }
        Write-Host "Starting main-service on port $env:MAIN_SERVICE_PORT ..." -ForegroundColor Cyan
        cargo run -p main_service
    }
    "storage" {
        if ($env:RUN_BACKGROUND_WORKERS -ne "false") {
            Write-Host "WARNING: RUN_BACKGROUND_WORKERS is not false: the cleanups will delete the VPS's transactions and blobs." -ForegroundColor Yellow
        }
        Write-Host "Starting storage-service on port 8082 ..." -ForegroundColor Cyan
        if ($env:STATIC_FOLDER_PATH) { New-Item -ItemType Directory -Force $env:STATIC_FOLDER_PATH | Out-Null }
        cargo run -p storage --bin storage
    }
    "socket" {
        Write-Host "Starting socket-service on port $env:SOCKET_SERVER_PORT ..." -ForegroundColor Cyan
        mix phx.server
    }
    "frontend" {
        Write-Host "Starting the frontend dev server ..." -ForegroundColor Cyan
        pnpm exec nx run frontend:dev
    }
}
