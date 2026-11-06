# Run the local checks, build the production image and push it to GHCR.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/publish.ps1 -Tag develop
#
# This is the local replacement for the automatic GitHub Actions image build.
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
