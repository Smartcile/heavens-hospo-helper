# Build the local production image ONLY when the source is newer than it, then
# start the stack. After that, start/stop the containers in Docker Desktop and
# it is instant (no rebuild).
#
#   .\build-local.cmd          (double-click / run this — bypasses PS policy)
#   .\build-local.ps1          (if your execution policy allows scripts)
#
# Trade-off: no hot reload. Re-run this after changing code.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$compose = Join-Path $root 'docker-compose.local.yml'
$image = 'hospo-ops:local'

Write-Host 'Checking for a fresh build...' -ForegroundColor Cyan

# Newest app-affecting source file (ignore deps, build output and tests).
$srcRoots = @((Join-Path $root 'apps\web'), (Join-Path $root 'packages'))
$files = Get-ChildItem -Path $srcRoots -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.next\\|\\\.turbo\\' -and $_.Name -notmatch '\.test\.' }
$rootFiles = Get-ChildItem -Path $root -File | Where-Object { $_.Name -in @('package.json', 'package-lock.json') }
$newest = (@($files) + @($rootFiles) | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
$newestTime = $newest.LastWriteTime.ToUniversalTime()

$imageCreated = (docker image inspect -f '{{.Created}}' $image 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $imageCreated) { $imageCreated = $null }

$needsBuild = $false
if (-not $imageCreated) {
  $needsBuild = $true
  Write-Host "No '$image' image yet - building (first build takes a few minutes)..." -ForegroundColor Yellow
} else {
  # Docker timestamps have 9 fractional digits; trim to 7 so .NET can parse.
  $iso = [regex]::Replace($imageCreated.Trim(), '(\.\d{1,7})\d*', '$1')
  $imgTime = [datetime]::Parse($iso).ToUniversalTime()
  if ($newestTime -gt $imgTime) {
    $needsBuild = $true
    Write-Host 'Source changed since the last build - rebuilding...' -ForegroundColor Yellow
  } else {
    Write-Host 'Image is up to date - starting without rebuilding.' -ForegroundColor Green
  }
}

if ($needsBuild) {
  docker compose -f $compose build
  if ($LASTEXITCODE -ne 0) { Write-Host 'Build failed.' -ForegroundColor Red; exit 1 }
}

Write-Host 'Starting the stack...' -ForegroundColor Cyan
docker compose -f $compose up -d
Write-Host 'Ready: http://localhost:3000  (admin@demo.com / admin1234)' -ForegroundColor Green
Write-Host 'Start/stop hospo-local-app + hospo-local-db in Docker Desktop from now on.'
