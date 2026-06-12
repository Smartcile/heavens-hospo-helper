# HOSPO OPS

A self-hosted hospitality operations platform for venue managers and floor staff. Managers configure tasks and schedules via a web admin panel. Staff scan a printed QR code, enter their PIN, and complete their daily tasks on their phone.

---

## PREREQUISITES

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- [Git](https://git-scm.com/)
- (Optional, for local dev) [Node.js 20+](https://nodejs.org/)

---

## INSTALL AND FIRST RUN

### With Docker (recommended)

```bash
# 1. Clone the repo
git clone <your-repo-url> hospo-ops
cd hospo-ops

# 2. Create your environment file
cp .env.example .env
```

Edit `.env` and set strong values for:
- `DB_PASSWORD` — your PostgreSQL password
- `NEXTAUTH_SECRET` — generate with: `openssl rand -base64 32`
- `WORKER_SESSION_SECRET` — generate with: `openssl rand -base64 32`
- `NEXTAUTH_URL` — the public URL of your server (e.g. `http://192.168.1.10`)
- `APP_URL` — same as `NEXTAUTH_URL`

```bash
# 3. Start the containers
cd infra
docker compose up -d

# 4. Wait for db to be healthy, then run migrations
docker compose exec app npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# 5. Seed the database with demo data
docker compose exec app npm run db:seed --workspace=packages/db
```

The app will be available at `http://localhost` (port 80).

### Local development (no Docker)

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp apps/web/.env.local.example apps/web/.env.local
# Edit .env.local — point DATABASE_URL to your local Postgres

# 3. Run migrations and seed
cd packages/db
npx prisma migrate dev
npm run db:seed

# 4. Start dev server
cd ../..
npm run dev
```

App runs at `http://localhost:3000`.

---

## DEFAULT CREDENTIALS

After seeding, the following accounts exist:

| Role | Login Email | PIN |
|---|---|---|
| Admin | `admin@demo.com` | `0000` |
| Bar Manager | `bar@demo.com` | `1111` |
| Kitchen Manager | `kitchen@demo.com` | `2222` |
| FOH Manager | `foh@demo.com` | `3333` |

**Change these immediately in production.** Admin PINs are changed via **Settings** in the admin panel.

---

## HOW TO ACCESS THE ADMIN PANEL

1. Open `http://your-server/admin/login`
2. Enter your login email and PIN
3. You will land on the Dashboard

---

## HOW TO GENERATE AND PRINT A QR CODE

1. Go to **Admin → QR Codes**
2. Click **+ GENERATE QR CODE**
3. Select the venue and optionally a department
4. Enter a label (e.g. "BAR MORNING ENTRY")
5. Click **GENERATE**
6. Click **DOWNLOAD PNG** on the generated code
7. Print the PNG and display it at the entry point for that area

Workers scan the QR code with their phone camera — it opens the PIN login directly.

---

## HOW TO ADD STAFF AND ASSIGN PINs

1. Go to **Admin → Staff**
2. Click **+ NEW STAFF**
3. Fill in first name, last name, select a role, venue, and department
4. Enter a 2–4 digit PIN for the staff member
5. Click **SAVE**

The PIN is immediately usable at any QR code login point for that venue/department.

---

## ENVIRONMENT VARIABLE REFERENCE

| Variable | Required | Description |
|---|---|---|
| `DB_USER` | Yes | PostgreSQL username |
| `DB_PASSWORD` | Yes | PostgreSQL password |
| `DATABASE_URL` | Yes | Full Postgres connection string |
| `NEXTAUTH_SECRET` | Yes | Secret for admin session JWT signing |
| `NEXTAUTH_URL` | Yes | Public app URL (used by NextAuth) |
| `APP_NAME` | No | Display name (default: HOSPO OPS) |
| `APP_URL` | Yes | Used to generate QR code URLs |
| `DEFAULT_TIMEZONE` | No | Fallback timezone (default: Pacific/Auckland) |
| `WORKER_SESSION_SECRET` | Yes | Secret for worker PIN session JWT signing |
| `WORKER_SESSION_EXPIRY_MINUTES` | No | Worker auto-logout timeout (default: 15) |
| `UPLOAD_PROVIDER` | No | `local` only in Phase 1 |
| `UPLOAD_PATH` | No | File upload directory (default: /app/uploads) |

---

## HOW TO UPDATE

```bash
# Pull latest code
git pull

# Rebuild and restart containers
cd infra
docker compose down
docker compose up -d --build

# Apply any new migrations
docker compose exec app npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

---

## BACKUP (POSTGRESQL DATA)

The PostgreSQL data is stored in a Docker volume (`postgres_data`). To back it up:

```bash
# Dump to a file
docker compose exec db pg_dump -U $DB_USER hospo_ops > backup-$(date +%Y%m%d).sql

# Restore from a file
docker compose exec -T db psql -U $DB_USER hospo_ops < backup-20240101.sql
```

Set up a cron job to run the dump command daily and copy it off-server.
