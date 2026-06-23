# LOCAL DEV SETUP

## Prerequisites
- Docker Desktop (running)
- Node.js 18+

## One-time setup

```powershell
# Install dependencies
npm install

# Copy env file
copy apps\web\.env.local.example apps\web\.env.local
# Edit apps\web\.env.local — set DATABASE_URL

# Start PostgreSQL
docker run -d --name hospo-pg -e POSTGRES_PASSWORD=hospo123 -e POSTGRES_DB=hospo_ops -p 5432:5432 postgres:16-alpine

# Generate Prisma client + create tables + seed
cd packages\db
npx prisma generate
npx prisma db push
npm run db:seed
cd ..
```

## Daily commands

| Action | Command |
|--------|---------|
| Start Postgres | `docker start hospo-pg` |
| Start dev server | `npm run dev` |
| Open app | http://localhost:3000 |
| Stop dev server | `Ctrl + C` |
| Type-check | `npm run build --prefix apps/web` |
| Re-seed DB | `npm run db:seed` |
| View DB logs | `docker logs hospo-pg` |

## Login

| Email | Password | Role |
|-------|----------|------|
| admin@demo.com | admin1234 | ADMIN |
| bar@demo.com | bar1234 | BAR MANAGER |
