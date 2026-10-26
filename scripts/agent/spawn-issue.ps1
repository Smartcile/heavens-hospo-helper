[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][int]$Issue,
  [string]$WorktreeRoot = "",
  [switch]$SkipInstall,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if ([string]::IsNullOrWhiteSpace($WorktreeRoot)) {
  $WorktreeRoot = Join-Path $RepoRoot ".worktrees"
}

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

Require-Command git
Require-Command gh

$dirty = @(git -C $RepoRoot status --porcelain)
if ($dirty.Count -gt 0 -and -not $Force) {
  throw "The main checkout has uncommitted changes. Commit or stash them first, then re-run. Use -Force only if you understand that the worktree will be based on origin/develop without them."
}

$currentBranch = (git -C $RepoRoot rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne "develop" -and -not $Force) {
  throw "The main checkout is on '$currentBranch', not 'develop'. Switch to develop or re-run with -Force."
}

$issueJson = gh issue view $Issue --json number,title,body,labels,comments,url 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Could not read issue #$Issue from GitHub: $($issueJson -join ' ')"
}
$issue = $issueJson | ConvertFrom-Json

$labels = @($issue.labels | ForEach-Object { $_.name })
if (($labels -notcontains "agent:approved") -and -not $Force) {
  throw "Issue #$Issue does not have the 'agent:approved' label. Review the triage comment, add the label, then re-run. Use -Force to skip this gate."
}

$slug = $issue.title.ToLowerInvariant()
$slug = [regex]::Replace($slug, "[^a-z0-9]+", "-").Trim("-")
if ($slug.Length -gt 48) {
  $slug = $slug.Substring(0, 48).Trim("-")
}
if ([string]::IsNullOrWhiteSpace($slug)) {
  $slug = "issue"
}

$branch = "issue/$Issue-$slug"
$worktreePath = Join-Path $WorktreeRoot "issue-$Issue"

if (Test-Path -LiteralPath $worktreePath) {
  throw "Worktree folder already exists: $worktreePath"
}

git -C $RepoRoot show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) {
  throw "Branch '$branch' already exists locally."
}

if (-not (Test-Path -LiteralPath $WorktreeRoot)) {
  New-Item -ItemType Directory -Path $WorktreeRoot -Force | Out-Null
}

Write-Host "Fetching origin/develop..."
$fetchOutput = git -C $RepoRoot fetch origin develop --quiet 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "git fetch origin develop failed: $($fetchOutput -join ' ')"
}

Write-Host "Creating worktree at $worktreePath..."
$worktreeOutput = git -C $RepoRoot worktree add -b $branch $worktreePath origin/develop 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "git worktree add failed: $($worktreeOutput -join ' ')"
}

$requiredAgent = Join-Path $worktreePath ".opencode\agents\implementer.md"
if (-not (Test-Path -LiteralPath $requiredAgent)) {
  Write-Warning "This worktree does not contain .opencode/agents/implementer.md. Commit and push the workflow setup to develop before spawning a worker."
}

$envSource = Join-Path $RepoRoot "apps\web\.env.local"
$envTarget = Join-Path $worktreePath "apps\web\.env.local"
if (Test-Path -LiteralPath $envSource) {
  Copy-Item -LiteralPath $envSource -Destination $envTarget -Force
  Write-Host "Copied apps/web/.env.local into the worktree."
} else {
  Write-Warning "apps/web/.env.local was not found. Copy it manually if the worker needs it."
}

$agentDir = Join-Path $worktreePath ".agent"
New-Item -ItemType Directory -Path $agentDir -Force | Out-Null

$comments = ""
foreach ($comment in @($issue.comments)) {
  if ($null -eq $comment) { continue }
  $author = "unknown"
  if ($comment.author -and $comment.author.login) {
    $author = $comment.author.login
  }
  $comments += "### $author - $($comment.createdAt)`r`n`r`n$($comment.body)`r`n`r`n"
}

$task = @"
# Issue #$($issue.number) - $($issue.title)

- Issue: $($issue.url)
- Branch: $branch
- Base: origin/develop
- Worktree: $worktreePath

## Problem

$($issue.body)

## Issue discussion / approved plan

$comments

## Acceptance criteria

- [ ] The issue is fixed.
- [ ] Tests cover the changed logic.
- [ ] `npm run lint` passes.
- [ ] Relevant tests pass; the full test suite passes before shipping.

## Guardrails

- Change only what this issue needs.
- Do not refactor unrelated code.
- Do not run `prisma db push`, `prisma migrate`, `db:seed`, or any Docker command.
- Do not merge, force-push, or push to `develop`, `main`, or `master`.
- If a schema change is needed, stop and ask first.
- Update docs when models, routes, or conventions change.

## Definition of done

- [ ] Code committed on this branch.
- [ ] Lint and relevant tests pass.
- [ ] Reviewer findings addressed.
- [ ] Human review done.
- [ ] PR opened to `develop`.
"@

$taskPath = Join-Path $agentDir "TASK.md"
Set-Content -LiteralPath $taskPath -Value $task -Encoding UTF8

$commonDir = (git -C $worktreePath rev-parse --git-common-dir).Trim()
if (-not [System.IO.Path]::IsPathRooted($commonDir)) {
  $commonDir = Join-Path $worktreePath $commonDir
}
$commonDir = (Resolve-Path -LiteralPath $commonDir).Path
$excludePath = Join-Path $commonDir "info\exclude"
$excludeDir = Split-Path $excludePath -Parent
if (-not (Test-Path -LiteralPath $excludeDir)) {
  New-Item -ItemType Directory -Path $excludeDir -Force | Out-Null
}
$existingExclude = @()
if (Test-Path -LiteralPath $excludePath) {
  $existingExclude = @(Get-Content -LiteralPath $excludePath)
}
if ($existingExclude -notcontains ".agent/") {
  Add-Content -LiteralPath $excludePath -Value ".agent/"
}

if (-not $SkipInstall) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
  }
  if (-not $npm) {
    throw "npm was not found on PATH."
  }

  Push-Location $worktreePath
  try {
    Write-Host "Installing dependencies in the worktree (this can take a few minutes)..."
    & $npm.Source install --prefer-offline --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed."
    }

    Write-Host "Generating the Prisma client..."
    & $npm.Source run db:generate
    if ($LASTEXITCODE -ne 0) {
      throw "npm run db:generate failed."
    }
  } finally {
    Pop-Location
  }
}

gh issue edit $Issue --add-label "agent:working" 2>&1 | Out-Null

Write-Host ""
Write-Host "Worktree ready."
Write-Host "  Issue:  #$Issue $($issue.title)"
Write-Host "  Branch: $branch"
Write-Host "  Folder: $worktreePath"
Write-Host "  Brief:  $taskPath"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. In OpenCode Desktop, open this folder as a project:"
Write-Host "       $worktreePath"
Write-Host "  2. Select the 'implementer' agent."
Write-Host "  3. Say: Read .agent/TASK.md and implement it."
Write-Host "  4. When it is done: @reviewer review the diff for issue #$Issue"
Write-Host "  5. After your review: /ship $Issue"
