[CmdletBinding(DefaultParameterSetName = "Single")]
param(
  [Parameter(Mandatory = $true, ParameterSetName = "Single")][int]$Issue,
  [Parameter(Mandatory = $true, ParameterSetName = "Group")][int[]]$Issues,
  [string]$Name = "",
  [string]$WorktreeRoot = "",
  [switch]$SkipInstall,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if ([string]::IsNullOrWhiteSpace($WorktreeRoot)) {
  $WorktreeRoot = Join-Path $RepoRoot ".worktrees"
}

function Require-Command($CommandName) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command '$CommandName' was not found on PATH."
  }
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $FilePath @Arguments 2>&1
    $code = $LASTEXITCODE
    return [pscustomobject]@{ Output = @($output); Code = $code }
  } finally {
    $ErrorActionPreference = $previous
  }
}

function ConvertTo-Slug([string]$Text) {
  $value = $Text.ToLowerInvariant()
  $value = [regex]::Replace($value, "[^a-z0-9]+", "-").Trim("-")
  if ($value.Length -gt 48) {
    $value = $value.Substring(0, 48).Trim("-")
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    return "issue"
  }
  return $value
}

Require-Command git
Require-Command gh

if ($PSCmdlet.ParameterSetName -eq "Group") {
  $issueNumbers = @($Issues | Select-Object -Unique)
} else {
  $issueNumbers = @($Issue)
}

if ($issueNumbers.Count -eq 0) {
  throw "No issue numbers supplied."
}

$isGroup = $issueNumbers.Count -gt 1

$dirty = @(git -C $RepoRoot status --porcelain)
if ($dirty.Count -gt 0 -and -not $Force) {
  throw "The main checkout has uncommitted changes. Commit or stash them first, then re-run. Use -Force only if you understand that the worktree will be based on origin/develop without them."
}

$currentBranch = (git -C $RepoRoot rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne "develop" -and -not $Force) {
  throw "The main checkout is on '$currentBranch', not 'develop'. Switch to develop or re-run with -Force."
}

$issueDataList = @()
foreach ($issueNumber in $issueNumbers) {
  $issueResult = Invoke-Native -FilePath "gh" -Arguments @("issue", "view", "$issueNumber", "--json", "number,title,body,labels,comments,url")
  if ($issueResult.Code -ne 0) {
    throw "Could not read issue #$issueNumber from GitHub: $($issueResult.Output -join ' ')"
  }
  $issueDataList += (($issueResult.Output -join "`n") | ConvertFrom-Json)
}

foreach ($issueData in $issueDataList) {
  $labels = @($issueData.labels | ForEach-Object { $_.name })
  if (($labels -notcontains "agent:approved") -and -not $Force) {
    throw "Issue #$($issueData.number) does not have the 'agent:approved' label. Review the triage comment, add the label, then re-run. Use -Force to skip this gate."
  }
}

if (-not [string]::IsNullOrWhiteSpace($Name)) {
  $slug = ConvertTo-Slug $Name
} elseif ($isGroup) {
  $slug = "issues-" + ($issueNumbers -join "-")
} else {
  $slug = ConvertTo-Slug $issueDataList[0].title
}

if ($isGroup) {
  $branch = "wave/$slug"
  $worktreePath = Join-Path $WorktreeRoot "wave-$slug"
} else {
  $branch = "issue/$($issueNumbers[0])-$slug"
  $worktreePath = Join-Path $WorktreeRoot "issue-$($issueNumbers[0])"
}

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
$fetchResult = Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRoot, "fetch", "origin", "develop", "--quiet")
if ($fetchResult.Code -ne 0) {
  throw "git fetch origin develop failed: $($fetchResult.Output -join ' ')"
}

Write-Host "Creating worktree at $worktreePath..."
$worktreeResult = Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRoot, "worktree", "add", "-b", $branch, $worktreePath, "origin/develop")
if ($worktreeResult.Code -ne 0) {
  throw "git worktree add failed: $($worktreeResult.Output -join ' ')"
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

$issueSections = ""
foreach ($issueData in $issueDataList) {
  $comments = ""
  foreach ($comment in @($issueData.comments)) {
    if ($null -eq $comment) { continue }
    $author = "unknown"
    if ($comment.author -and $comment.author.login) {
      $author = $comment.author.login
    }
    $comments += "### $author - $($comment.createdAt)`r`n`r`n$($comment.body)`r`n`r`n"
  }

  $issueSections += @"

## Issue #$($issueData.number) - $($issueData.title)

- Issue: $($issueData.url)

### Problem

$($issueData.body)

### Discussion / approved plan

$comments

"@
}

$fixLines = ($issueNumbers | ForEach-Object { "Fixes #$_" }) -join "`r`n"

if ($isGroup) {
  $taskTitle = "Issues #" + ($issueNumbers -join ", #")
  if (-not [string]::IsNullOrWhiteSpace($Name)) {
    $taskTitle += " - $Name"
  }
} else {
  $taskTitle = "Issue #$($issueNumbers[0]) - $($issueDataList[0].title)"
}

$task = @"
# $taskTitle

- Branch: $branch
- Base: origin/develop
- Worktree: $worktreePath
- Issues: $($issueNumbers -join ", ")

$issueSections

## Acceptance criteria

- [ ] Every issue above is fixed.
- [ ] Tests cover the changed logic.
- [ ] `npm run lint` passes.
- [ ] Relevant tests pass; the full test suite passes before shipping.

## Guardrails

- Change only what these issues need.
- Do not refactor unrelated code.
- Do not run `prisma db push`, `prisma migrate`, `db:seed`, or any Docker command.
- Do not merge, force-push, or push to `develop`, `main`, or `master`.
- If a schema change is needed, stop and ask first.
- Update docs when models, routes, or conventions change.

## PR instructions

When shipping, include these lines in the PR body:

$fixLines

## Definition of done

- [ ] Code committed on this branch.
- [ ] Lint and relevant tests pass.
- [ ] Reviewer findings addressed.
- [ ] Human review done.
- [ ] If a screenshot was requested, it was posted on the issue.
- [ ] PR opened to `develop`.
"@

$taskPath = Join-Path $agentDir "TASK.md"
Set-Content -LiteralPath $taskPath -Value $task -Encoding UTF8

$issuesPath = Join-Path $agentDir "ISSUES"
Set-Content -LiteralPath $issuesPath -Value ($issueNumbers -join ",") -Encoding ASCII

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
    $installResult = Invoke-Native -FilePath $npm.Source -Arguments @("install", "--prefer-offline", "--legacy-peer-deps")
    if ($installResult.Code -ne 0) {
      throw "npm install failed: $($installResult.Output -join ' ')"
    }

    Write-Host "Generating the Prisma client..."
    $generateResult = Invoke-Native -FilePath $npm.Source -Arguments @("run", "db:generate")
    if ($generateResult.Code -ne 0) {
      throw "npm run db:generate failed: $($generateResult.Output -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

foreach ($issueNumber in $issueNumbers) {
  Invoke-Native -FilePath "gh" -Arguments @("issue", "edit", "$issueNumber", "--add-label", "agent:working") | Out-Null
}

Write-Host ""
Write-Host "Worktree ready."
Write-Host "  Issues: #$($issueNumbers -join ', #')"
Write-Host "  Branch: $branch"
Write-Host "  Folder: $worktreePath"
Write-Host "  Brief:  $taskPath"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. In OpenCode Desktop, open this folder as a project:"
Write-Host "       $worktreePath"
Write-Host "  2. Select the 'implementer' agent."
Write-Host "  3. Say: Read .agent/TASK.md and implement it."
Write-Host "  4. When it is done: @reviewer review the diff for the issues in .agent/ISSUES"
if ($isGroup) {
  Write-Host "  5. After your review: /ship-group $($issueNumbers -join ',')"
} else {
  Write-Host "  5. After your review: /ship $($issueNumbers[0])"
}
