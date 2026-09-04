# Start both halves of the system.
#
#   .\scripts\dev.ps1            start the agent and the portal
#   .\scripts\dev.ps1 -Reseed    rebuild the database from the fixtures first
#   .\scripts\dev.ps1 -Stop      stop whatever this script started
#
# The agent must run from inside agent/ - it resolves its database, .env, outbox and
# audit log relative to the working directory - so this changes directory for it rather
# than passing paths around.

[CmdletBinding()]
param(
    [switch]$Reseed,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$agent = Join-Path $root "agent"
$portal = Join-Path $root "portal"

function Stop-Existing {
    Get-Process python, node -ErrorAction SilentlyContinue | ForEach-Object {
        try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine }
        catch { $cmd = "" }
        if ($cmd -match "uvicorn|next dev") {
            Write-Host "  stopping pid $($_.Id)" -ForegroundColor DarkGray
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($Stop) {
    Write-Host "Stopping..." -ForegroundColor Yellow
    Stop-Existing
    Write-Host "Stopped." -ForegroundColor Green
    exit 0
}

# --- preflight ----------------------------------------------------------------------
if (-not (Test-Path (Join-Path $agent ".env"))) {
    Write-Host "agent/.env is missing." -ForegroundColor Red
    Write-Host "  Copy-Item agent\.env.example agent\.env   then add your GEMINI_API_KEY."
    Write-Host "  (The deterministic check needs no key; only the AI nodes do.)"
    exit 1
}
if (-not (Test-Path (Join-Path $portal "node_modules"))) {
    Write-Host "portal/node_modules is missing. Run:  cd portal; npm install" -ForegroundColor Red
    Write-Host "  That step also unpacks node_modules/next/dist/docs, which the portal's"
    Write-Host "  AGENTS.md tells you to read before writing any Next.js code."
    exit 1
}
if (-not (Test-Path (Join-Path $portal ".env.local"))) {
    Write-Host "portal/.env.local is missing - the portal will not reach the agent." -ForegroundColor Yellow
    Write-Host "  Copy-Item portal\.env.example portal\.env.local"
}

Write-Host "Stopping anything already running..." -ForegroundColor DarkGray
Stop-Existing
Start-Sleep -Seconds 2

# --- seed -----------------------------------------------------------------------------
if ($Reseed) {
    Write-Host "`nSeeding the database (golden fixtures + the portal's purchase orders)..." -ForegroundColor Cyan
    Push-Location $agent
    try {
        python -m uv run python -m app.cli seed --portal
    } finally { Pop-Location }
}

# --- start ----------------------------------------------------------------------------
Write-Host "`nStarting the bill checking agent..." -ForegroundColor Cyan
Start-Process -FilePath "python" `
    -ArgumentList "-m", "uv", "run", "uvicorn", "app.api.main:create_app", "--factory", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $agent -WindowStyle Hidden | Out-Null

Write-Host "Starting the supplier portal..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory $portal -WindowStyle Hidden | Out-Null

# --- wait for both --------------------------------------------------------------------
function Wait-For([string]$url, [string]$name, [int]$seconds = 60) {
    for ($i = 0; $i -lt $seconds; $i++) {
        try {
            $null = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3
            Write-Host "  $name is up" -ForegroundColor Green
            return $true
        } catch { Start-Sleep -Seconds 1 }
    }
    Write-Host "  $name did not come up within $seconds seconds" -ForegroundColor Red
    return $false
}

Write-Host ""
$agentOk = Wait-For "http://127.0.0.1:8000/review" "agent " 60
$portalOk = Wait-For "http://127.0.0.1:3000/app/bills" "portal" 90

Write-Host ""
if ($agentOk -and $portalOk) {
    Write-Host "Ready." -ForegroundColor Green
    Write-Host "  Supplier portal    http://localhost:3000/app/bills"
    Write-Host "  Bill checking      http://localhost:3000/app/billcheck   (needs BILLCHECK_INTERNAL=true)"
    Write-Host "  Approve a bill     http://127.0.0.1:8000/review"
    Write-Host ""
    Write-Host "  Try it: open the portal, pick PO-2026-0001, and submit the bill." -ForegroundColor DarkGray
    Write-Host "  Then try PO-2026-0015 - only 60% was delivered, so billing it in full" -ForegroundColor DarkGray
    Write-Host "  comes back for review with the over-billing cut on both lines." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Stop with:  .\scripts\dev.ps1 -Stop" -ForegroundColor DarkGray
} else {
    Write-Host "Something did not start. Check the two hidden windows, or run each half" -ForegroundColor Red
    Write-Host "by hand as described in README.md." -ForegroundColor Red
    exit 1
}
