# ==============================================================================
# Barely - Automated Setup Script for Windows PowerShell
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🚀 Barely Autonomous QA - Windows Setup" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# 1. Check Python installation
try {
    $pythonVersion = python --version 2>&1
    Write-Host "🐍 [1/5] Python detected: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python is not installed or not in PATH." -ForegroundColor Red
    Write-Host "👉 Download and install Python from https://www.python.org/downloads/ (check 'Add Python to PATH')." -ForegroundColor Yellow
    Exit 1
}

# 2. Create virtual environment
Write-Host "📁 [2/5] Configuring virtual environment (.venv)..." -ForegroundColor White
if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

# Activate virtualenv
$activateScript = ".\.venv\Scripts\Activate.ps1"
if (Test-Path $activateScript) {
    & $activateScript
}

# 3. Install packages
Write-Host "⚙️  [3/5] Installing Barely packages in editable mode..." -ForegroundColor White
python -m pip install --upgrade pip --quiet
python -m pip install -e packages/core -e packages/cli -e plugins/reporter-pdf --quiet

# 4. Install Playwright Chromium
Write-Host "🌐 [4/5] Installing Playwright Chromium browser..." -ForegroundColor White
python -m playwright install chromium

# 5. Create .env if missing
Write-Host "🔐 [5/5] Checking environment secrets..." -ForegroundColor White
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
    Write-Host "    Created .env from .env.example" -ForegroundColor Green
}

# Diagnostics
Write-Host ""
Write-Host "🩺 Running Barely Doctor..." -ForegroundColor White
try {
    barely doctor
} catch {
    Write-Host "Note: Configure your API keys in .env to complete setup." -ForegroundColor Yellow
}

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "🎉 Barely setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To begin testing:"
Write-Host "  1. Activate virtual environment: .\.venv\Scripts\Activate.ps1"
Write-Host "  2. Configure your API key in .env"
Write-Host "  3. Run a test goal: barely run .barely\goals\example.md"
Write-Host ""
