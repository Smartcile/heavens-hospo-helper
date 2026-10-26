[CmdletBinding()]
param([string]$WorktreeRoot = "")

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if ([string]::IsNullOrWhiteSpace($WorktreeRoot)) {
  $WorktreeRoot = Join-Path $RepoRoot ".worktrees"
}

if (-not (Test-Path -LiteralPath $WorktreeRoot)) {
  Write-Host "No worktree root at $WorktreeRoot"
  return
}

git -C $RepoRoot fetch origin develop --quiet 2>&1 | Out-Null

$porcelain = git -C $RepoRoot worktree list --porcelain
$entries = @()
$current = @{}

foreach ($line in $porcelain) {
  if ([string]::IsNullOrWhiteSpace($line)) {
    if ($current.Count -gt 0) {
      $entries += [pscustomobject]$current
      $current = @{}
    }
    continue
  }

  $parts = $line.Split(" ", 2)
  if ($parts.Count -eq 2) {
    $current[$parts[0]] = $parts[1]
  }
}

if ($current.Count -gt 0) {
  $entries += [pscustomobject]$current
}

$rows = @()

foreach ($entry in $entries) {
  $dir = $entry.worktree
  if (-not $dir) { continue }
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  if ((Resolve-Path -LiteralPath $dir).Path -eq $RepoRoot) { continue }

  $branch = $entry.branch
  if ($branch) {
    $branch = $branch -replace "^refs/heads/", ""
  }

  $dirty = @(git -C $dir status --porcelain).Count -gt 0
  $ahead = 0
  $behind = 0

  if ($branch) {
    $counts = git -C $dir rev-list --left-right --count "origin/develop...$branch" 2>&1
    if ($LASTEXITCODE -eq 0 -and $counts) {
      $bits = $counts.Trim() -split "\s+"
      if ($bits.Count -eq 2) {
        $behind = [int]$bits[0]
        $ahead = [int]$bits[1]
      }
    }
  }

  $pr = "-"
  $ci = "-"
  if ($branch) {
    $prJson = gh pr list --head $branch --state all --json number,state,statusCheckRollup --limit 1 2>&1
    if ($LASTEXITCODE -eq 0 -and $prJson) {
      $prList = @($prJson | ConvertFrom-Json)
      if ($prList.Count -gt 0) {
        $pr = "#$($prList[0].number) $($prList[0].state)"
        $checks = @($prList[0].statusCheckRollup)
        if ($checks.Count -gt 0 -and $null -ne $checks[0]) {
          $failed = @($checks | Where-Object { $_.conclusion -in @("FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED") })
          $pending = @($checks | Where-Object { $_.status -in @("IN_PROGRESS", "QUEUED", "PENDING", "WAITING", "REQUESTED") })
          if ($failed.Count -gt 0) {
            $ci = "FAIL"
          } elseif ($pending.Count -gt 0) {
            $ci = "PENDING"
          } else {
            $ci = "PASS"
          }
        }
      }
    }
  }

  $rows += [pscustomobject]@{
    Branch = $branch
    Worktree = $dir
    Dirty = $dirty
    Ahead = $ahead
    Behind = $behind
    PR = $pr
    CI = $ci
  }
}

if ($rows.Count -eq 0) {
  Write-Host "No issue worktrees."
  return
}

$rows | Sort-Object Branch | Format-Table -AutoSize
