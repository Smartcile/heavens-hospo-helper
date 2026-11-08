# OPTIONAL FALLBACK: build the production image and push it to GHCR locally.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/publish.ps1 -Tag develop
#
# GitHub Actions now builds and pushes the image automatically on a push to
# develop/main (and v* tags). Use this only when Actions is unavailable.
# Requires Docker running and a `docker login ghcr.io` with a token that can
# write packages. Push the source code separately.

[CmdletBinding()]
param(
  [string]$Tag = "develop",
  [switch]$SkipChecks,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$repo = "smartcile/heavens-hospo-helper"
$image = "ghcr.io/$($repo):$Tag"

Push-Location -LiteralPath $RepoRoot
try {
  if (-not $SkipChecks) {
    & (Join-Path $PSScriptRoot 'check.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Local checks failed." }
  }

  if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "=== Building image: $image ===" -ForegroundColor Cyan
    docker build -f apps/web/Dockerfile -t $image .
    if ($LASTEXITCODE -ne 0) { throw "Docker build failed." }
    Write-Host "Build OK" -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "=== Pushing to GHCR ===" -ForegroundColor Cyan
  docker push $image
  if ($LASTEXITCODE -ne 0) { throw "Push failed. Run 'docker login ghcr.io' and retry." }

  Write-Host ""
  Write-Host "Done: $image is live. Git push the source separately." -ForegroundColor Green
} finally {
  Pop-Location
}
