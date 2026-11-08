# Optional local pre-flight. GitHub Actions is the gate: the `CI` workflow runs
# lint, type-check, the full test suite and the Next.js build on every PR.
# Use this only for a fast local check.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/check.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/check.ps1 -Build
#
# Runs: dependency check -> prisma generate -> lint -> type-check -> test.
# Add -Build to compile the Next.js app, -Install to force a reinstall, or
# -SkipLint / -SkipTypeCheck / -SkipTest for a quick pass.

[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$Build,
  [switch]$SkipLint,
  [switch]$SkipTypeCheck,
  [switch]$SkipTest
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) { throw "npm was not found on PATH." }
$npmPath = $npm.Source

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $start = Get-Date
  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  & $npmPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed (exit $LASTEXITCODE)."
  }
  $elapsed = [int]((Get-Date) - $start).TotalSeconds
  Write-Host "=== $Name OK (${elapsed}s) ===" -ForegroundColor Green
}

Push-Location -LiteralPath $RepoRoot
try {
  $nodeModules = Join-Path $RepoRoot 'node_modules'
  if ($Install -or -not (Test-Path -LiteralPath $nodeModules)) {
    Invoke-Step 'Install dependencies' @('install', '--prefer-offline', '--legacy-peer-deps')
  }

  Invoke-Step 'Prisma client' @('run', 'db:generate')
  if (-not $SkipLint) { Invoke-Step 'Lint' @('run', 'lint') }
  if (-not $SkipTypeCheck) { Invoke-Step 'Type check' @('run', 'type-check') }
  if (-not $SkipTest) { Invoke-Step 'Tests' @('run', 'test') }

  if ($Build) {
    # apps/web prebuild bumps version.json on every build. Restore it so a
    # local verification build never leaves the worktree dirty.
    $versionPath = Join-Path $RepoRoot 'apps\web\version.json'
    $versionBefore = $null
    if (Test-Path -LiteralPath $versionPath) {
      $versionBefore = Get-Content -LiteralPath $versionPath -Raw
    }
    try {
      Invoke-Step 'Build' @('run', 'build')
    } finally {
      if ($null -ne $versionBefore) {
        Set-Content -LiteralPath $versionPath -Value $versionBefore -NoNewline
      }
    }
  }

  Write-Host ""
  Write-Host "Local checks passed." -ForegroundColor Green
} finally {
  Pop-Location
}
