# Start local dev environment
Write-Host "Killing stale node processes..."
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Starting Postgres..."
docker start hospo-pg 2>$null
if (-not $?) { Write-Host "Creating Postgres container..."; docker run -d --name hospo-pg -e POSTGRES_PASSWORD=hospo123 -e POSTGRES_DB=hospo_ops -p 5432:5432 postgres:16-alpine }
Start-Sleep -Seconds 2

# Sync schema and generate Prisma client (self-healing — safe to run every time)
Write-Host "Syncing database schema..."
$dbDir = Join-Path $PSScriptRoot "packages\db"
# Load DATABASE_URL from apps/web/.env.local for prisma db push
$envLocal = Join-Path $PSScriptRoot "apps\web\.env.local"
if (Test-Path $envLocal) {
    Get-Content $envLocal | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)') {
            $name = $matches[1].Trim()
            $val = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $val
        }
    }
}
Push-Location -LiteralPath $dbDir
try {
    npx prisma generate
    if ($?) { npx prisma db push }
    if ($?) { Write-Host "Unifying furniture into inventory..."; npm run db:migrate-furniture }
    if ($?) { Write-Host "Pushing DB seed..."; npm run db:seed }
    if ($?) { Write-Host "Migrating to Guide model..."; npm run db:migrate-guides }
    if ($?) { Write-Host "Recovering guide step links..."; npm run db:migrate-step-links }
    if ($?) { Write-Host "Backfilling guide audiences..."; npm run db:backfill-guide-audiences }
} finally {
    Pop-Location
}

# Clear stale .next cache (EPERM fix)
$nextDir = Join-Path $PSScriptRoot "apps\web\.next"
if (Test-Path $nextDir) { Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue }

# Clean stale turbo daemon pids
$turbodDir = Join-Path $env:TEMP "turbod"
if (Test-Path $turbodDir) { Remove-Item -LiteralPath $turbodDir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "Starting dev server (http://localhost:3000)..."
npm run dev
