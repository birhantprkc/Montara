$ErrorActionPreference = "Stop"

Write-Host "== Montara setup =="

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "pnpm is missing. Install it first: https://pnpm.io/installation"
  exit 1
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "Python is missing. Install Python 3.10+ first."
  exit 1
}

pnpm install
python -m pip install -r requirements/dev.txt

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

if (Test-Path "remotion-composer/package.json") {
  Push-Location "remotion-composer"
  npm install
  Pop-Location
}

pnpm run montara doctor

Write-Host ""
Write-Host "All set. Try: pnpm run montara start"
