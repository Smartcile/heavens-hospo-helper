# HOSPO OPS — AI CODING CONTEXT

HOSPO OPS is a self-hosted, web-based hospitality operations platform. It gives venue managers a dashboard to create and assign recurring tasks, and gives floor staff a fast mobile interface (accessed via printed QR code + PIN) to complete those tasks.

## TECH STACK

| Layer | Version |
|---|---|
| Language | TypeScript (strict mode) |
| Framework | Next.js 14+ (App Router) |
| Database | PostgreSQL 16 |
| ORM | Prisma 5 |
| Styling | Tailwind CSS 3 |
| Containerisation | Docker Compose |
| Reverse Proxy | Nginx (inside Docker Compose) |
| Repo Structure | Turborepo monorepo |
| Auth (admin) | NextAuth.js v4 — Credentials provider |
| Auth (worker) | Custom PIN flow — JWT in HTTP-only cookie |
| QR Generation | `qrcode` npm package |

## MONOREPO STRUCTURE

```
hospo-ops/
├── apps/
│   └── web/                        # Next.js app (admin + worker UI)
│       ├── app/
│       │   ├── admin/
│       │   │   ├── (protected)/    # Auth-gated admin routes (/admin/*)
│       │   │   └── login/          # /admin/login — public
│       │   ├── w/
│       │   │   ├── (authenticated)/# PIN-gated worker routes (/w/*)
│       │   │   └── login/          # /w/login?token=... — public
│       │   └── api/                # API route handlers
│       │       ├── admin/          # Admin API endpoints
│       │       ├── worker/         # Worker API endpoints
│       │       └── auth/           # NextAuth handler
│       ├── components/
│       │   ├── admin/              # Admin-specific components (all Client Components)
│       │   ├── worker/             # Worker-specific components
│       │   └── ui/                 # Shared UI primitives
│       ├── lib/                    # Utilities, auth config, worker-session
│       └── public/uploads/         # Local file uploads (dev only)
├── packages/
│   ├── db/                         # Prisma schema + migrations + seed
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── index.ts                # Exported Prisma client (global singleton)
│   ├── types/                      # Shared TypeScript types/interfaces
│   └── config/                     # Shared Tailwind config
├── .github/workflows/
│   └── docker-build.yml            # CI: builds image, pushes to GHCR
├── apps/web/Dockerfile             # Single-stage image (build + runtime)
├── apps/web/docker-entrypoint.sh   # Runs migrate + seed, then `next start`
├── docker-compose.yml              # Canonical stack — PULLS image from GHCR
├── .env.example                    # Env template for compose / Portainer
├── CLAUDE.md                       # This file
├── README.md                       # User-facing setup guide
└── ROADMAP.md                      # Phased feature roadmap
```

## HOW TO RUN LOCALLY (DEV)

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill env file
cp apps/web/.env.local.example apps/web/.env.local
# Edit .env.local — set DATABASE_URL to your local Postgres instance

# 3. Run Prisma migrations
cd packages/db
npx prisma migrate dev

# 4. Seed the database
npm run db:seed

# 5. Start the dev server
cd ../..
npm run dev
```

## HOW TO RUN WITH DOCKER

The image is built by GitHub Actions (`.github/workflows/docker-build.yml`) and
published to `ghcr.io/smartcile/heavens-hospo-helper:latest` on every push to
`master`. The root `docker-compose.yml` PULLS that image — nothing is built on
the server.

```bash
# From the repo root
cp .env.example .env
# Edit .env — set strong passwords, secrets, and the public URL (with port)

docker compose pull
docker compose up -d
```

On container start, `apps/web/docker-entrypoint.sh` automatically runs
`prisma db push` (reconciles the live DB to match `schema.prisma`), seeds the
DB (idempotent), then launches `next start -H 0.0.0.0 -p 3000`. No manual
migrate/seed step is needed.

**Why `db push` and not `migrate deploy` at deploy time:** auto-running
`migrate deploy` on every boot crash-loops the container if a migration is ever
interrupted (Prisma marks it failed → P3009 → exit non-zero → restart → repeat).
`db push` keeps no migration history and is self-healing, which is the right
trade-off for a single-instance self-hosted deploy. The `0_init` migration is
kept in the repo for reference / future controlled migrations.

In Portainer: **Stacks → Add stack → Repository**, compose path
`docker-compose.yml`, set the env vars from the table below, deploy.

## DATABASE

```bash
# Generate Prisma client after schema changes
cd packages/db && npx prisma generate

# Create a new migration
cd packages/db && npx prisma migrate dev --name describe_change

# Apply migrations in production
cd packages/db && npx prisma migrate deploy

# Reset database (DESTRUCTIVE — dev only)
cd packages/db && npx prisma migrate reset --force

# Open Prisma Studio
cd packages/db && npx prisma studio
```

## ENVIRONMENT VARIABLES

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Secret for NextAuth JWT signing |
| `NEXTAUTH_URL` | Public URL of the app (e.g. https://hospo.example.com) |
| `APP_NAME` | App display name (white-label) |
| `APP_URL` | Public URL used for QR code generation |
| `DEFAULT_TIMEZONE` | Fallback timezone (e.g. Pacific/Auckland) |
| `WORKER_SESSION_SECRET` | JWT secret for worker PIN sessions |
| `WORKER_SESSION_EXPIRY_MINUTES` | Worker auto-logout timeout (default: 15) |
| `UPLOAD_PROVIDER` | `local` (Phase 1) — future: `s3` |
| `UPLOAD_PATH` | Where uploaded files are written to disk |
| `NEXT_PUBLIC_APP_NAME` | Client-side app name |
| `NEXT_PUBLIC_WORKER_SESSION_EXPIRY_MINUTES` | Client-side inactivity timer value |

## ADMIN LOGIN SYSTEM

Admin login uses **email + PIN** (not email + password). The admin's "email" is stored in the `swiftPosId` field as a login identifier. This is a Phase 1 compromise — Phase 2 will introduce proper email-based auth with password hashing.

Default seed accounts:
- Admin: `admin@demo.com` / PIN `0000`
- Bar Manager: `bar@demo.com` / PIN `1111`
- Kitchen Manager: `kitchen@demo.com` / PIN `2222`
- FOH Manager: `foh@demo.com` / PIN `3333`

To create admin accounts with login access, set the `swiftPosId` field to the login email. The PIN is always bcrypt-hashed.

## KEY ARCHITECTURAL DECISIONS

### Dual auth system
- **Admin**: NextAuth.js with Credentials provider — creates a JWT session cookie (`next-auth.session-token`). Suitable for desktop, supports 8-hour sessions.
- **Worker**: Custom JWT in an HTTP-only cookie (`hospo-worker-session`). Minimal — just stores staffId, venueId, and expiry. Auto-logout after 15 minutes of inactivity (client-side timer + server-side JWT expiry).

### Route structure
- Admin routes live under `app/admin/(protected)/` — the inner route group applies the auth layout without affecting URL structure.
- Worker routes live under `app/w/(authenticated)/` — same pattern.
- Login pages (`/admin/login`, `/w/login`) are outside the protected groups so they don't inherit the auth check.

### Soft deletes everywhere
Every model has `deletedAt DateTime?`. Set `deletedAt: new Date()` to delete. Never use Prisma `delete()`. Always add `where: { deletedAt: null }` to all queries.

### ALL CAPS convention
Task titles, venue names, department names, and staff names are stored in UPPERCASE. Apply `.toUpperCase().trim()` before every insert/update.

### Prisma client singleton
`packages/db/index.ts` exports a global singleton Prisma client to prevent connection pool exhaustion in Next.js dev (hot reload creates new instances without this pattern).

### Task scheduling
Phase 1 uses no cron engine — task generation is on-demand. When a worker loads their task list, the API queries all active tasks for their venue/department and filters by:
- `DAILY`: always shown
- `WEEKLY`: shown if `scheduleDays` contains today's day-of-week (0=Sun)
- `CUSTOM`: cron expression stored for Phase 2 engine

`TaskCompletion.scheduledDate` is the **calendar date** the task was for (not when it was submitted), allowing completion tracking across timezones.

### Task templates (Phase 2)
`TaskTemplate` + `TaskTemplateItem` hold reusable SOP task sets. Built-in
templates are seeded with `isBuiltIn: true` / `venueId: null` (global, read-only
in the UI). Custom templates are venue-scoped. Applying a template
(`POST /api/admin/templates/[id]/apply`) bulk-creates `Task` rows in a chosen
department, skipping any whose title already exists there (re-apply is safe).
`POST /api/admin/templates/from-department` snapshots a department's active
tasks into a new template. Admin UI lives at `/admin/templates`.

## NAMING CONVENTIONS

- All primary keys: UUID `@default(uuid())`
- All tables: `createdAt`, `updatedAt`, `deletedAt` (soft delete)
- Enums: `SCREAMING_SNAKE_CASE`
- Task titles, venue/department names: stored and displayed in `UPPERCASE`
- UI labels, nav items, buttons: `text-transform: uppercase` via Tailwind/CSS
- API routes: `/api/admin/*` (admin) and `/api/worker/*` (worker)
- Components: `PascalCase.tsx`
- Client components: always marked `'use client'`

## FUTURE INTEGRATION STUBS

| Stub | Location | Phase |
|---|---|---|
| SwiftPOS staff sync | `Staff.swiftPosId` field | 2 |
| Budget splitter | `BudgetPeriod`, `BudgetDayAllocation` models | 4 |
| Training modules | `TrainingModule`, `TrainingStep` models | 3 |
| Push notifications | Not yet wired | 2 |
| S3 file uploads | `UPLOAD_PROVIDER=s3` env var stub | 2 |

## WHAT NOT TO DO

- **NO hard deletes** — never call `prisma.model.delete()`. Always set `deletedAt`.
- **NO `any` types** — TypeScript strict mode. Use types from `packages/types`.
- **NO inline styles** — Tailwind utility classes only.
- **NO plain-text PINs** — always bcrypt hash before storing, never log.
- **NO direct DB access in client components** — Server Actions or API routes only.
- **NO manual schema changes** — change `schema.prisma`, never hand-edit the DB. (Deploy syncs it via `prisma db push`; see "Why db push" above.)
- **NO storing session tokens in `localStorage`** — HTTP-only cookies only.
