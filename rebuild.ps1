# rebuild.ps1 — runs TypeScript type-check and build
Write-Host "=== REBUILD ===" -ForegroundColor Cyan

Set-Location -LiteralPath $PSScriptRoot

Write-Host "→ Type-check and build..." -ForegroundColor Yellow
npm run build --prefix apps/web

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ BUILD PASSES" -ForegroundColor Green
} else {
    Write-Host "✗ BUILD FAILED — see errors above" -ForegroundColor Red
    exit $LASTEXITCODE
}
