[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][int]$Issue,
  [string]$Path = "/",
  [ValidateSet("public", "admin", "worker")][string]$Role = "public",
  [string]$BaseUrl = "",
  [int]$Port = 3100,
  [switch]$Mobile,
  [switch]$FullPage,
  [string]$Click = "",
  [string]$WaitFor = "",
  [int]$WaitMs = 1500,
  [string]$Email = "",
  [string]$Password = "",
  [switch]$StartServer,
  [string]$Worktree = "",
  [switch]$PostComment
)

$ErrorActionPreference = "Stop"

$RepoRootPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = "http://localhost:$Port"
}
$BaseUrl = $BaseUrl.TrimEnd("/")
if (-not $Path.StartsWith("/")) {
  $Path = "/$Path"
}

$screenshotDir = Join-Path $RepoRootPath ".agent\screenshots"
New-Item -ItemType Directory -Path $screenshotDir -Force | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$localPath = Join-Path $screenshotDir "issue-$Issue-$stamp.png"
$targetUrl = "$BaseUrl$Path"

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

function Read-DotEnvValue([string]$File, [string]$Key) {
  if (-not (Test-Path -LiteralPath $File)) { return "" }
  $line = Get-Content -LiteralPath $File | Where-Object { $_ -match "^$([regex]::Escape($Key))=" } | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

if ([string]::IsNullOrWhiteSpace($Email)) {
  $Email = $env:AGENT_SCREENSHOT_EMAIL
  if ([string]::IsNullOrWhiteSpace($Email)) {
    $Email = Read-DotEnvValue (Join-Path $RepoRootPath "apps\web\.env.local") "AGENT_SCREENSHOT_EMAIL"
  }
}
if ([string]::IsNullOrWhiteSpace($Password)) {
  $Password = $env:AGENT_SCREENSHOT_PASSWORD
  if ([string]::IsNullOrWhiteSpace($Password)) {
    $Password = Read-DotEnvValue (Join-Path $RepoRootPath "apps\web\.env.local") "AGENT_SCREENSHOT_PASSWORD"
  }
}

if ($Role -ne "public" -and ([string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password))) {
  throw "Screenshots for role '$Role' need AGENT_SCREENSHOT_EMAIL and AGENT_SCREENSHOT_PASSWORD in apps/web/.env.local, or -Email/-Password."
}

function Publish-Screenshot([string]$FilePath) {
  $branch = "agent-screenshots"
  $temp = Join-Path $env:TEMP ("hospo-agent-screenshots-" + [guid]::NewGuid().ToString("N"))

  try {
    $remoteCheck = Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRootPath, "ls-remote", "--heads", "origin", $branch)
    $remoteExists = ($remoteCheck.Code -eq 0 -and -not [string]::IsNullOrWhiteSpace(($remoteCheck.Output -join "")))

    if ($remoteExists) {
      Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRootPath, "fetch", "origin", $branch) | Out-Null
      $add = Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRootPath, "worktree", "add", "--detach", $temp, "origin/$branch")
    } else {
      $add = Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRootPath, "worktree", "add", "--detach", $temp, "origin/develop")
    }

    if ($add.Code -ne 0) {
      throw "Could not create the screenshot worktree: $($add.Output -join ' ')"
    }

    $destDir = Join-Path $temp "agent-screenshots"
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    $dest = Join-Path $destDir (Split-Path $FilePath -Leaf)
    Copy-Item -LiteralPath $FilePath -Destination $dest -Force

    $gitAdd = Invoke-Native -FilePath "git" -Arguments @("-C", $temp, "add", "agent-screenshots")
    if ($gitAdd.Code -ne 0) {
      throw "Could not stage the screenshot: $($gitAdd.Output -join ' ')"
    }

    $commit = Invoke-Native -FilePath "git" -Arguments @("-C", $temp, "-c", "user.name=opencode-agent", "-c", "user.email=opencode-agent@users.noreply.github.com", "commit", "-m", "chore: screenshot for issue #$Issue")
    if ($commit.Code -ne 0) {
      throw "Could not commit the screenshot: $($commit.Output -join ' ')"
    }

    $push = Invoke-Native -FilePath "git" -Arguments @("-C", $temp, "push", "origin", "HEAD:refs/heads/$branch")
    if ($push.Code -ne 0) {
      throw "Could not push the screenshot branch: $($push.Output -join ' ')"
    }

    $repoResult = Invoke-Native -FilePath "gh" -Arguments @("repo", "view", "--json", "nameWithOwner")
    if ($repoResult.Code -ne 0) {
      throw "Could not read the repo name: $($repoResult.Output -join ' ')"
    }
    $repo = ($repoResult.Output -join "`n") | ConvertFrom-Json

    $fileName = Split-Path $FilePath -Leaf
    return "https://raw.githubusercontent.com/$($repo.nameWithOwner)/$branch/agent-screenshots/$fileName"
  } finally {
    Invoke-Native -FilePath "git" -Arguments @("-C", $RepoRootPath, "worktree", "remove", "--force", $temp) | Out-Null
  }
}

$serverProcess = $null
$serverLog = Join-Path $screenshotDir "devserver-$Port.log"
$serverErr = Join-Path $screenshotDir "devserver-$Port.err.log"

try {
  if ($StartServer) {
    if ([string]::IsNullOrWhiteSpace($Worktree)) {
      throw "-StartServer needs -Worktree pointing at the issue worktree."
    }

    $worktreePath = (Resolve-Path -LiteralPath $Worktree).Path
    $webDir = Join-Path $worktreePath "apps\web"
    if (-not (Test-Path -LiteralPath $webDir)) {
      throw "Could not find apps/web in $worktreePath."
    }

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
      throw "Port $Port is already in use. Choose another -Port."
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
      $npm = Get-Command npm -ErrorAction SilentlyContinue
    }
    if (-not $npm) {
      throw "npm was not found on PATH."
    }

    $env:NEXTAUTH_URL = $BaseUrl
    Write-Host "Starting dev server on $BaseUrl..."
    $serverProcess = Start-Process -FilePath $npm.Source -ArgumentList @("run", "dev", "--", "-p", "$Port") -WorkingDirectory $webDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr

    $ready = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
      Start-Sleep -Seconds 1
      if ($serverProcess.HasExited) { break }
      try {
        $response = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
          $ready = $true
          break
        }
      } catch {
      }
    }

    if (-not $ready) {
      $tail = @()
      if (Test-Path -LiteralPath $serverLog) { $tail += Get-Content -LiteralPath $serverLog -Tail 20 }
      if (Test-Path -LiteralPath $serverErr) { $tail += Get-Content -LiteralPath $serverErr -Tail 20 }
      throw "The dev server did not start. Check $serverLog and $serverErr. $($tail -join ' ')"
    }
  }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { throw "node was not found on PATH." }

  $script = Join-Path $PSScriptRoot "screenshot.mjs"
  $nodeArgs = @("--url", $targetUrl, "--out", $localPath, "--role", $Role, "--wait-ms", "$WaitMs")
  if ($Mobile) { $nodeArgs += "--mobile" }
  if ($FullPage) { $nodeArgs += "--full-page" }
  if ($Click) { $nodeArgs += @("--click", $Click) }
  if ($WaitFor) { $nodeArgs += @("--wait-for", $WaitFor) }
  if ($Role -ne "public") { $nodeArgs += @("--email", $Email, "--password", $Password) }

  Write-Host "Capturing $targetUrl..."
  & $node.Source $script @nodeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Screenshot capture failed."
  }

  if (-not (Test-Path -LiteralPath $localPath)) {
    throw "Screenshot was not created: $localPath"
  }

  $rawUrl = Publish-Screenshot -FilePath $localPath
  Write-Host "Screenshot saved: $localPath"
  Write-Host "Screenshot URL: $rawUrl"

  if ($PostComment) {
    $body = @"
### Screenshot

![screenshot]($rawUrl)

Captured from ``$Path`` at a $(if ($Mobile) { "mobile" } else { "desktop" }) viewport.
"@
    $comment = Invoke-Native -FilePath "gh" -Arguments @("issue", "comment", "$Issue", "--body", $body)
    if ($comment.Code -ne 0) {
      throw "Screenshot was uploaded, but the issue comment failed: $($comment.Output -join ' ')"
    }
  }

  Write-Output $rawUrl
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    & taskkill.exe /PID $serverProcess.Id /T /F 2>&1 | Out-Null
  }
}
