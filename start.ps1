# Start local dev environment
Write-Host "Killing stale node processes..."
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Starting Postgres..."
docker start hospo-pg 2>$null
if (-not $?) { Write-Host "Creating Postgres container..."; docker run -d --name hospo-pg -e POSTGRES_PASSWORD=hospo123 -e POSTGRES_DB=hospo_ops -p 5432:5432 postgres:16-alpine }
Start-Sleep -Seconds 2

# Clear stale .next cache (EPERM fix)
$nextDir = Join-Path $PSScriptRoot "apps\web\.next"
if (Test-Path $nextDir) { Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "Starting dev server (http://localhost:3000)..."
npm run dev
