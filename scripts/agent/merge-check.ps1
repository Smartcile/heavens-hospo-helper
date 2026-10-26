[CmdletBinding()]
param([string[]]$Branches = @())

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

git -C $RepoRoot fetch origin develop --quiet 2>&1 | Out-Null

if ($Branches.Count -eq 0) {
  $Branches = @(git -C $RepoRoot for-each-ref --format="%(refname:short)" refs/heads/issue refs/heads/wave 2>$null)
}

if ($Branches.Count -eq 0) {
  Write-Host "No issue/* branches."
  return
}

$rows = @()
$fileMap = @{}

foreach ($branch in $Branches) {
  if ([string]::IsNullOrWhiteSpace($branch)) { continue }

  $counts = git -C $RepoRoot rev-list --left-right --count "origin/develop...$branch" 2>&1
  $behind = 0
  $ahead = 0
  if ($LASTEXITCODE -eq 0 -and $counts) {
    $bits = $counts.Trim() -split "\s+"
    if ($bits.Count -eq 2) {
      $behind = [int]$bits[0]
      $ahead = [int]$bits[1]
    }
  }

  $files = @()
  $diffOutput = git -C $RepoRoot diff --name-only "origin/develop...$branch" 2>&1
  if ($LASTEXITCODE -eq 0) {
    $files = @($diffOutput)
  }

  $rows += [pscustomobject]@{
    Branch = $branch
    Ahead = $ahead
    Behind = $behind
    Files = $files.Count
  }

  foreach ($file in $files) {
    if (-not $fileMap.ContainsKey($file)) {
      $fileMap[$file] = @()
    }
    $fileMap[$file] += $branch
  }
}

$rows | Sort-Object Branch | Format-Table -AutoSize

$overlaps = @($fileMap.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 } | Sort-Object Key)

if ($overlaps.Count -eq 0) {
  Write-Host "No file overlap between issue branches."
} else {
  Write-Host ""
  Write-Host "File overlap (serialize these branches or merge carefully):"
  foreach ($item in $overlaps) {
    Write-Host "  $($item.Key)"
    foreach ($branch in $item.Value) {
      Write-Host "    - $branch"
    }
  }
}
