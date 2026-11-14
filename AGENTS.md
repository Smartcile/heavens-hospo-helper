# HOSPO OPS — AI CODING CONTEXT

HOSPO OPS is a self-hosted hospitality ERP and operations platform. It manages venues, staff, tasks, inventory, recipes, floor plans, budgets, local menus/orders, and auto-seating with recipe explosion and inventory deduction. The WooCommerce integration is **frozen** (Phase 0 of #60 — no traffic is sent to or pulled from a store; the historical models/columns and the `lib/woo-*` helpers remain dormant for a future re-integration).

> **NOTE (2026-10-09):** This file was formerly `CLAUDE.md`. The original was deleted from the repo in commit `daed88c` (2026-08-10) and has been recovered from git history (last version: commit `5a97fad`, 2026-08-06) into `AGENTS.md`, which is now the canonical AI context doc — use this from now on. The recovered snapshot was then **audited and updated against the code at commit `c429869`** (2026-10-09); everything below reflects the current codebase. If code and doc disagree, the code wins — and fix the doc.

> Behavioural working rules live in the global `~/.claude/CLAUDE.md` (apply to all projects).

## TECH STACK

| Layer | Version |
|---|---|
| Language | TypeScript (strict mode) |
| Framework | Next.js 14.2 (App Router) |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 (PG adapter) |
| Styling | Tailwind CSS 4 (CSS-first @theme) |
| Containerisation | Docker Compose |
| Repo Structure | Turborepo monorepo |
| Auth (admin) | NextAuth.js v4 — Credentials provider |
| Auth (worker) | Custom PIN flow — JWT in HTTP-only cookie |
| QR Generation | `qrcode` npm package |
| Canvas / Floor Plans | `pixi.js` v7.3.3 |
| Node graphs | `@xyflow/react` v12 (React Flow) — pathways board + structure map |
| PDF | `jspdf` (generate) + `pdf-lib` (fill/flatten AcroForm templates) |
| Media | `sharp` (image compression) + `ffmpeg` (system binary, phone MP4 transcode) |
| Email | `nodemailer` (gift-card send; SMTP creds supplied per request) |
| Testing | Vitest 3 + @testing-library/react + jsdom |
| Linting | ESLint 9 (flat config) + eslint-config-next 15 |

## MONOREPO STRUCTURE

```
hospo-ops/
├── apps/
│   └── web/                        # Next.js app (admin + worker UI)
│       ├── app/
│       │   ├── page.tsx            # / — split-screen landing (worker link + admin login)
│       │   ├── admin/(protected)/  # Auth-gated admin routes (/admin/*)
│       │   ├── w/                  # Worker routes (/w/login public; /w/* PIN-gated)
│       │   ├── e/[token]/          # Public customer BEO share link (read-only + requests)
│       │   └── api/                # API route handlers
│       │       ├── admin/          # Admin API endpoints (permission-gated)
│       │       ├── worker/         # Worker API endpoints
│       │       ├── public/         # API-key / token endpoints (Woo plugin, event shares, booking widget)
│       │       ├── webhooks/       # WooCommerce webhook receiver
│       │       ├── cron/           # External scheduler fallback endpoints
│       │       └── auth/           # NextAuth handler
│       ├── components/
│       │   ├── admin/              # Admin-specific components (all Client Components)
│       │   ├── worker/             # Worker-specific components
│       │   ├── availability/       # Shared availability calendar pieces
│       │   └── ui/                 # Shared UI primitives (Panel, Textarea, Combobox, ImagePicker…)
│       ├── lib/                    # Pure helpers (*.ts) + server halves (*.server.ts)
│       │   └── permissions/        # Permission registry (PERMISSION_TREE / presets)
│       └── public/uploads/         # Legacy local uploads (dev only; runtime writes go to UPLOAD_PATH)
├── packages/
│   ├── db/                         # Prisma 7 schema + PG adapter + seed
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # 162 models (as of 2026-11)
│   │   │   ├── seed.ts             # Idempotent demo/sample data
│   │   │   ├── migrate-*.ts        # One-off migrations wired into docker-entrypoint.sh
│   │   │   └── migrations/         # Legacy 0_init migration (kept for reference)
│   │   ├── prisma.config.ts        # Prisma 7 config (datasource, seed)
│   │   └── index.ts                # Exported Prisma client (global singleton, PG pool)
│   ├── types/                      # Shared TypeScript types/interfaces
│   └── config/                     # Lightweight package (tailwind.config.ts migrated to CSS @theme)
├── .github/workflows/
│   ├── ci.yml                      # PR gate: lint, type-check, test, Next build
│   └── docker-build.yml            # Push develop/main + v* tag: checks, builds image, pushes GHCR
├── apps/web/Dockerfile             # Single-stage image (node:22-alpine + openssl + ffmpeg)
├── apps/web/docker-entrypoint.sh   # prisma generate → migrations → db push → seed → `next start`
├── docker-compose.yml              # Canonical production stack — PULLS image from GHCR
├── docker-compose.dev.yml          # Local hot-reload dev stack
├── docker-compose.local.yml        # Local built-image stack (build-local.cmd)
├── docker-compose.wordpress.yml    # Local WordPress/Woo dev stack (wp-dev.ps1)
├── build-local.ps1 / build-and-push.ps1  # Local image build / GHCR push helpers
├── scripts/                        # bump-version, check-docs, generate-icons, capture-beo-screenshots
├── AGENTS.md                       # This file — canonical AI context doc
├── README.md                       # User-facing setup guide
├── NAVIGATION.md                   # Navigation / IA map (source of truth for hub re-organisation)
├── MENUS.md                        # Menus / products / serves / consumption design note
├── PLAYBOOK-GUIDE-BUILDER.md       # LLM prompt kit for authoring Playbook guides
└── SOP-WOOCOMMERCE.md              # WooCommerce integration setup SOP
```

> **`start.ps1`, `ROADMAP.md` and `ECOSYSTEM.md` no longer exist** (removed
> 2026-08-10). `scripts/check-docs.mjs` still lists `ROADMAP.md`, so
> `npm run docs:check` always warns until that list is updated.

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

Two local Docker stacks also exist (both bring up their own Postgres):
`docker-compose.dev.yml` (hot reload / `next dev`) and `docker-compose.local.yml`
(built production image, started via `build-local.cmd` — instant start/stop, no
hot reload). Both publish port 3000, so stop one before starting the other.

## HOW TO RUN WITH DOCKER

The image is built and published to `ghcr.io/smartcile/heavens-hospo-helper`
by GitHub Actions. A push to `develop` runs the checks and pushes `:develop`;
a push to `main` pushes `:latest` (+ `:main`); a `v*` tag pushes the semver
image. Pull requests run the `CI` workflow (lint, type-check, tests, Next.js
build). `scripts/agent/check.ps1` and `scripts/agent/publish.ps1` remain
optional local fallbacks. The root `docker-compose.yml` PULLS that image —
nothing is built on the server.

```bash
# From the repo root
cp .env.example .env
# Edit .env — set strong passwords, secrets, and the public URL (with port)

docker compose pull
docker compose up -d
```

On container start, `apps/web/docker-entrypoint.sh` runs, in order:
`prisma generate` → `db:migrate-budget` (pre-sync, reconciles the old
BudgetDayAllocation shape) → `prisma db push --accept-data-loss` (with a
`--force-reset` fallback for ancient DBs) → `db:migrate-furniture` →
`db:migrate-uom` → `db:migrate-step-links` + `db:backfill-guide-audiences` →
`db:migrate-timeoff` → `db:migrate-calendar-feeds` → `db:migrate-areas` →
`db:migrate-availability-comments` → `db:seed` (idempotent) →
`db:seed-help` (Heavenly Help sync, writes only
changed articles) → `next start -H 0.0.0.0 -p 3000`.
Every migration step is non-fatal (`|| echo …`) except the db push reset. No
manual migrate/seed step is needed.

**Why `db push` and not `migrate deploy` at deploy time:** auto-running
`migrate deploy` on every boot crash-loops the container if a migration is ever
interrupted (Prisma marks it failed → P3009 → exit non-zero → restart → repeat).
`db push` keeps no migration history and is self-healing, which is the right
trade-off for a single-instance self-hosted deploy. The `0_init` migration is
kept in the repo for reference / future controlled migrations.

In Portainer: **Stacks → Add stack → Repository**, compose path
`docker-compose.yml`, set the env vars from the table below, deploy.
For multiple instances running side-by-side, give each stack a unique
`INSTANCE_NAME` (container names become `{name}-app` / `{name}-db`) and a
unique `APP_PORT`.

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

**One-off migration/backfill scripts** (idempotent; wired into
`docker-entrypoint.sh` unless noted): `db:migrate-budget`,
`db:migrate-furniture`, `db:migrate-uom`, `db:migrate-step-links`,
`db:backfill-guide-audiences`, `db:migrate-timeoff`, `db:migrate-calendar-feeds`,
`db:migrate-areas`, `db:migrate-availability-comments`. Manual/dev-only:
`db:migrate-to-guides` (not wired — the legacy Training models now only exist
to keep old deployments migratable), `db:backfill-orders`,
`db:mock-furniture`, `db:mock-menu`, `db:verify-furniture`.

## ENVIRONMENT VARIABLES

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Secret for NextAuth JWT signing |
| `NEXTAUTH_URL` | Public URL of the app (e.g. https://hospo.example.com) |
| `APP_NAME` | App display name (white-label) |
| `APP_URL` | Public URL used for QR code generation |
| `DEFAULT_TIMEZONE` | Fallback timezone (e.g. Pacific/Auckland) |
| `INTERNAL_CRON` | Built-in scheduler (daily expiry scan). Default true; `false` = use external scheduler |
| `CRON_SECRET` | Bearer token for the /api/cron endpoints (external schedulers only) |
| `WORKER_SESSION_SECRET` | JWT secret for worker PIN sessions |
| `WORKER_SESSION_EXPIRY_MINUTES` | Fallback worker idle timeout when a venue leaves `workerSessionTimeoutMinutes` blank/0 (default: 15) |
| `UPLOAD_PROVIDER` | `local` (Phase 1) — future: `s3` |
| `UPLOAD_PATH` | Where uploaded files are written to disk |
| `NEXT_PUBLIC_APP_NAME` | Client-side app name |
| `NEXT_PUBLIC_WORKER_SESSION_EXPIRY_MINUTES` | Legacy build-time fallback only — the worker UI reads the venue timeout from `/api/worker/session` |

### Compose / Portainer-only variables

These are set as stack env vars (or in `.env` for plain compose). They are NOT
passed into the app container — they are consumed by Docker Compose itself.

| Variable | Default | Purpose |
|---|---|---|
| `INSTANCE_NAME` | `hospo-ops` | Unique short name. Drives container names (`{name}-app`, `{name}-db`). Change per stack for multi-instance deploys |
| `DB_DATA` | `postgres_data` | PostgreSQL storage. Named volume by default; set to a host path (e.g. `/mnt/data/db`) for a bind mount |
| `UPLOADS_DATA` | `uploads_data` | Upload storage. Named volume by default; set to a host path (e.g. `/mnt/data/uploads`) for a bind mount |
| `APP_PORT` | `3000` | Host port the app publishes on. Must be unique per stack |
| `IMAGE_TAG` | `latest` | Docker image tag to pull (e.g. `develop` for pre-release fixes) |

## ADMIN LOGIN SYSTEM

Admin/manager web login uses a real **email + password** (`Staff.email`,
`Staff.password`, bcrypt). Only `ADMIN`/`MANAGER` roles can log into the panel.
Floor `STAFF` log in separately via QR + `Staff.pin` (also bcrypt). `pin` is now
optional (a pure admin needn't have one); the worker login skips staff with no PIN.

Default seed web logins (email / password):
- Admin: `admin@demo.com` / `admin1234` — bootstrap login, never reset by re-seed
- BOH Manager: `boh@demo.com` / `boh1234`
- FOH Manager: `foh@demo.com` / `foh1234`
- H&S Officer: `hs@demo.com` / `hs1234` — **restricted** manager (`Staff.restricted: true`) with only the compliance grants

Worker QR+PIN logins: `0000` (admin), `1111` (manager), `1234`/`2345` (BOH staff), `3456`/`4567` (FOH staff).

**Migration:** earlier builds stored the login email in `swiftPosId` and used the
PIN as the password. The seed backfills `email`/`password` from those for any
existing ADMIN/MANAGER (and frees `swiftPosId`), so no one is locked out.

### Playbook Guides (Phase 6 — replaces Training)

`Guide` + `GuideStep` replace the old `TrainingModule`/`TrainingStep` system.
The legacy **UI, API routes and libs are gone** (`/admin/training`, `/w/training`,
`/w/sops`, `lib/training.ts`, `TrainingClient`, `TrainingEditModal`,
`StaffTrainingModal`, `WorkerTrainingClient`, `WorkerSopsClient`).

> The legacy **models** are still declared in `schema.prisma` on purpose.
> `docker-entrypoint.sh` runs `db push` *before* the migration scripts, and
> `migrate-to-guides.ts` + `migrate-step-links.ts` read those tables. Same
> reasoning as `TableProfile` — delete only once every deployment has migrated.

Step links were **restored, not re-added as five tables** — see "Guide step
links" below. `Guide.departmentId` is deprecated in favour of `GuideAudience`
but still honoured by the resolver until every row is backfilled.

A guide has:
- `status`: `DRAFT` | `PUBLISHED` — new guides start as DRAFT and must be
  explicitly published before workers can see them. No guide ever goes live by
  accident.
- `guideType: GuideType` — `HOW_TO | SOP | FAQ | TRAINING | POLICY | OTHER | PRODUCT_REFERENCE`. Purely presentational labelling, except `PRODUCT_REFERENCE`, which renders a table instead of steps.
- `bodyHtml: String?` — sanitised rich text shown above the steps (`lib/rich-text.ts` allowlist; re-sanitised on read).
- `folderId` — flat one-level `GuideFolder` for BIBLE organisation.
- `isTracked: boolean` — replaces the old `kind` enum. When true, the guide shows
  in the worker's "My Guides" list, tracks completions, and supports sign-off.
  When false, it's a reference-only document (old SOP/FAQ/HOWTO).
- `requiresSignOff: boolean` — when true, a manager must sign off via the Staff
  page modal. When false, the worker self-completes.
- `isOnboarding: boolean` — legacy onboarding flag; no longer edited in the UI
  (onboarding is modelled as a pathway), but still honoured by the resolver.
- `departmentId: String?` — deprecated in favour of `GuideAudience` and no longer
  edited in the UI; still honoured by the resolver.

A guide applies to a person when any of (precedence ASSIGNED > ONBOARDING > SECTION > POSITION > DEPARTMENT):
1. Individually assigned via `GuideAssignment` (with `reason`)
2. `isOnboarding: true` (all staff)
3. `GuideAudience` targeting a SECTION or POSITION the staff member holds
4. `GuideAudience` targeting their DEPARTMENT (or the legacy `departmentId`)

**Task linking** is done via `TaskGuide` — a single junction with
`isRequiredForCompetency: boolean`. When true, completing this guide is a
**competency requirement** before the task can be performed. When false, the
guide is a how-to reference for the task. Both are set from the guide form and
the task edit form.

**Completion** is tracked in `GuideCompletion` (`@@unique([guideId, staffId])`).
`selfCompleted: true` for worker self-complete; `signedOffById` for manager
sign-off. Revoke hard-deletes the row.

**Admin authoring** at `/admin/training?tab=playbook` (`/admin/guides` redirects
there; `GuidesClient`) — folder rail (prompt-based create/rename/delete; drag a
guide card onto a folder to file it; deleting a folder unfiles its guides in one
transaction, never deletes them), DRAFT/PUBLISHED badges + PUBLISH, guide-type
labels, rich-text body (`RichTextEditor`), audiences editor (DEPARTMENT /
SECTION / POSITION), linked tasks + competency tasks comboboxes,
isTracked/requiresSignOff checkboxes, steps (heading, content,
video, multi-image gallery with annotator), and **⬇ PDF** (single + multi-select
bulk) via `lib/guide-pdf.ts`.

**PRODUCT_REFERENCE guides** replace the step list with a table
(`GuideTableRow` + `tableColumns` JSON; `ReferenceTableEditor`). Column kinds are
manual text/number/money/image or **derived MENU_FIELD** columns
(NAME/PRICE/DESCRIPTION/IMAGE/DIETARY) pulled live from the linked `MenuItem` —
derived cells are never stored, so they cannot drift. A row-image edit writes the
MenuItem and best-effort pushes to Woo (`POST /api/admin/guides/product-image`).

**Image annotations** — `ImageAnnotation` rows keyed by `usageKey`
(e.g. `guide-step:<id>`, `guide-row:<id>:<col>`) + `imageUrl`, coordinates as
0–1 fractions. Non-destructive layers edited in the shared `ImageAnnotator`
(ADMIN-only write) and rendered read-only via `AnnotatedImage`; also drawn into
guide PDFs (`drawPdfAnnotation`). The same file can carry different annotations
in different places.

**Worker guide editing** — floor staff with the `training.playbook.create` /
`.edit` / `.publish` grants get an in-app DRAFT editor (`WorkerGuideEditor`) and
folder management: create/edit their own venue guides and PATCH publish via
`/api/worker/guides` (`lib/worker-guide-access.ts` gates). The editor mirrors the
admin form — title/type/category → **Applies To** audiences → linked tasks →
tracked/sign-off → instructions → steps last — and each step has the same
**Links** picker. Saving replaces audiences and step links, exactly like the
admin editor; a client that omits `audiences` leaves them untouched.

**Downloads from a guide** — PDFs are admin-side (`GET /api/admin/guides/[id]/pdf`,
`GET /api/admin/guides/pdf?ids=`); the worker reader has no PDF button.

**API routes:**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/guides` | GET, POST | List/create guides (list includes steps/links/rows/folders/audiences) |
| `/api/admin/guides/[id]` | GET, PUT, DELETE | Single guide CRUD (PUT diffs steps/rows by id) |
| `/api/admin/guides/[id]/publish` | PATCH | Toggle DRAFT ↔ PUBLISHED |
| `/api/admin/guides/[id]/pdf` | GET | Single-guide PDF |
| `/api/admin/guides/pdf` | GET | Merged PDF (`?ids=` or every venue guide) |
| `/api/admin/guides/product-image` | POST | Set a reference-row image on the MenuItem + push to Woo |
| `/api/admin/guides/complete` | POST, DELETE | Sign-off / revoke |
| `/api/admin/guides/assign` | POST, DELETE | Assign / unassign |
| `/api/admin/guide-folders` | GET, POST | List/create folders |
| `/api/admin/guide-folders/[id]` | PUT, DELETE | Rename/delete (unfiles guides) |
| `/api/admin/staff/[id]/guides` | GET | Staff's applicable guides + completions |
| `/api/worker/guides` | GET, POST | Worker's applicable guides (+ folders, canEdit/canPublish); create DRAFT |
| `/api/worker/guides/[id]` | GET, PUT | Read/edit (edit gated by grants) |
| `/api/worker/guides/[id]/read` | GET | Any published guide in the venue (for step-link popups) |
| `/api/worker/guides/[id]/publish` | PATCH | Publish (grant-gated) |
| `/api/worker/guides/[id]/complete` | POST | Self-complete (rejects sign-off-required and reference-only) |
| `/api/worker/guide-folders` | PUT | Reorder folders `{orderedIds}` |
| `/api/admin/guides/link-targets` | GET | Every step-link / audience target for a venue, one round trip |
| `/api/admin/pathways` | GET, POST | List/create pathways |
| `/api/admin/pathways/[id]` | GET, PUT, DELETE | Pathway CRUD + publish |
| `/api/admin/pathways/[id]/graph` | PUT | Bulk save nodes + edges + positions; 422 on a cycle |
| `/api/worker/pathway` | GET | The staff member's own tree, with statuses and points |

### Positions, audiences and step links (built 2026-08-02)

**`Position` + `StaffPosition`** — a *job title*, distinct from `Section` (a
*place*). "DUTY MANAGER" spans every section; "BARISTA" doesn't, so
`departmentId` is optional — and a position can now list **multiple departments**
via `PositionDepartment`. Many-to-many to staff, because one person routinely
covers several roles — no "all access" flag is needed, applicability just unions
across everything they hold. Managed on `/admin/sections` (`PositionsPanel`);
staff grouping in Roster/Availability/Clocks/Payroll is **derived by position**
(`lib/staff-groups.ts` — no `StaffGroup` table; the only persisted state is
`Position.sortOrder`, set via `POST /api/admin/positions/reorder`).

**Position requirements + readiness** — `PositionGuideRequirement` (extra
required guides), `PositionSection` (sections the role must be fully trained in),
`PositionPermission` (default grants, surfaced as presets in the Access drawer).
`lib/position-requirements.ts` is pure: required guides = explicit ∪ every
published guide targeting a required section, deduped; `resolveReadiness` returns
per-section statuses + percent + ready. `RoleRequirementsDrawer` on
`/admin/sections` edits them and its **ASSIGN MISSING** button creates
`GuideAssignment(reason: 'ROLE REQUIREMENT')` rows so gaps land in the worker's
My Guides. Roster shows a readiness warning when assigning an untrained person
(soft — confirm to override). Routes: `GET/PUT /api/admin/positions/[id]/requirements`,
`GET .../[id]/readiness`, `GET /api/admin/positions/readiness`,
`POST .../[id]/assign-missing`, `POST /api/admin/positions/reorder`.

**`GuideAudience`** (`kind: DEPARTMENT | SECTION | POSITION` + `targetId`)
replaces the single `Guide.departmentId`, which could only name one department
and could not reach a section or a role. A food-safety SOP can now target Kitchen
*and* Bar. One "APPLIES TO" control in the guide form covers all three.

**Applicability lives in one place — `lib/guides.ts`.** It had been copy-pasted
into three routes that drifted: the worker route omitted `GuideAssignment`
entirely, so individually-assigned guides showed in the admin modal but **never
reached the worker's phone**. `guideSource()` is pure and returns *why* a guide
applies (ASSIGNED > ONBOARDING > SECTION > POSITION > DEPARTMENT);
`guideWhereOr()` is the matching Prisma filter, kept beside it so the SQL and the
predicate cannot diverge.

**Guide step links — `GuideStepLink`.** One polymorphic row
(`kind: ITEM | TASK | CHECKLIST | GUIDE | SECTION | RECIPE`, `targetId`, `qty`,
`note`) replaces the five junctions the legacy `TrainingStep` carried. One table,
one `+ LINK` control, one renderer (`components/GuideStepLinks.tsx`, shared by
the admin preview and the worker reader). A new link type is an enum value, not a
migration.

> **Trade-off:** polymorphic `targetId` means no FK. `lib/guide-links.server.ts`
> does the two jobs an FK would have: it batch-loads **one query per kind**
> (a 20-step guide costs ≤6 queries, not ~100) and renders a purged target as
> "ITEM REMOVED" rather than throwing.
>
> **`lib/guide-links.ts` must stay Prisma-free.** The worker reader renders links
> in the browser; importing the server half from a client component drags the
> `pg` driver into the client bundle and `next build` fails on
> `Can't resolve 'fs'`. Types and pure helpers live in `guide-links.ts`, all DB
> work in `guide-links.server.ts`.

**Guide `PUT` diffs steps by id** rather than `deleteMany` + `create`. Step ids
used to change on every save, which would orphan anything hanging off a step.
Links are still replaced wholesale — nothing hangs off a link — and are synced
*after* the step diff, joined by array index since saved steps come back ordered
`0..n-1`.

**Migrations** (both idempotent, both wired into `docker-entrypoint.sh`
**after** `db push`):
- `migrate-step-links.ts` — rebuilds the links `migrate-to-guides.ts` logged as
  `[DROPPED]`. The legacy rows still exist, and the guide kept the module id
  verbatim with step `order` preserved, so `(guideId == moduleId, order)` is a
  reliable join. Clears `legacyToolsNote` once recovered.
- `backfill-guide-audiences.ts` — copies `Guide.departmentId` into a
  `GuideAudience` row, skipping deleted departments.

### Pathways — the onboarding / progression tree (built 2026-08-02)

`Pathway` → `PathwayNode` (`kind: GUIDE | TASK | CHECKLIST | MILESTONE`, `x`,
`y`, `stage`, `points`) → `PathwayEdge` (`from` → `to` = "finish this to unlock
that"). Targeted by nullable `positionId` / `sectionId` / `departmentId`; the
worker route picks the **most specific** match.

**A pathway stores shape, not progress.** A node reads DONE because a
`GuideCompletion` / `TaskCompletion` already exists — there is no progress table
multiplying by staff × node. Points and levels are summed on read.

`lib/pathway-progress.ts` is pure and Prisma-free (28 tests); it is the single
brain behind the admin board, the admin tree list, the worker tech tree and the
staff modal. `lib/pathway-for-staff.ts` is the DB bridge (which nodes are done,
plus batched node titles).

Three rules worth keeping:
- **A completed node stays DONE even if its prerequisites aren't.** Work is never
  gated on the floor, so someone can legitimately finish a guide out of order;
  recomputing that away would be wrong.
- **A MILESTONE is awarded, never completed.** It has no completion row — it
  flips to DONE once every prerequisite is DONE. That gives the "stage cleared"
  reward with no extra table. An unwired milestone stays AVAILABLE, not DONE.
- **Cycles resolve to LOCKED rather than hanging**, and `findPathwayCycle`
  rejects them at save time with a 422.

**Admin** `/admin/training?tab=pathways` (the `/admin/pathways` stub redirects)
— BOARD (React Flow 12, drag to place, drag
handle-to-handle to set a prerequisite, **positions persist**) and TREE (the same
data as an indented outline). Unlike the Structure MAP, this layout is authored,
so node changes are applied to state instead of being regenerated each render.

**Worker** `/w/guides` has two tabs: **BIBLE** (every guide that applies, read
anything any time) and **MY TREE** (`WorkerPathwayTree`). The tree is **CSS grid
+ SVG, not React Flow** — it runs on a phone, needs no dragging, and a canvas
library would be a heavy download for a read-only view; columns come from
`stage`, and connectors are measured from the laid-out DOM via `ResizeObserver`.
Locked nodes are **readable but not bankable** ("COMPLETE X FIRST"); ticking a
task is never blocked by any of this.

**Migration:** `packages/db/prisma/migrate-to-guides.ts` reads old
`TrainingModule`/`TrainingStep` data, creates `Guide`/`GuideStep`/`TaskGuide`
rows with `status: 'DRAFT'`, flattens `StepInventoryItem` into
`legacyToolsNote`, drops step-level junctions. Idempotent — skips if guides
already exist. Old tables left intact for reference.

### Section-work reviews — manager confirmation before a section is granted (built 2026-10)

Finishing a section's training no longer has any effect on `StaffSection` by
itself. `StaffSection` still means **granted** (it feeds guide applicability,
worker pathway targeting and training status), so a review queue sits in front
of it:

- `SectionWorkReview` (`venueId`, `staffId`, `sectionId`, `source`
  `GUIDES|PATHWAY`, optional `pathwayId`, `status PENDING|CONFIRMED|DISMISSED`,
  `evidence`, `requestedAt`, `reviewedById`/`reviewedAt`/`note`, soft delete).
  `@@unique([staffId, sectionId])` keeps one row per person + section.
- `evidence` is a stable signature (`GUIDES:g1,g2|PATHWAY:p1`), so a dismissed
  review only reopens when the qualifying evidence **changes** — not on every
  page load. A **manager** DISMISS keeps the signature; a **system** auto-dismiss
  clears `evidence`/`pathwayId`, so restoring the same work reopens it.
- The unique key is `(staffId, sectionId)` across soft-deleted rows too, so
  reconcile restores a soft-deleted row in place instead of hitting P2002.

**Eligibility (`lib/section-work.ts`, pure).** A section is trainable when at
least one PUBLISHED, tracked guide targets it via `GuideAudience(kind: SECTION)`;
it is complete only when every such guide has a `GuideCompletion`. Zero guides is
never complete. Pathways count via `isPathwayComplete` (any MILESTONE `DONE` in
the resolved view).

**Reconcile (`lib/section-work.server.ts`).** `reconcileSectionWork(staffId)`:
for sections the person does not already hold, raises a `PENDING` review when
eligible + complete. It never writes `StaffSection`. A still-PENDING review whose
evidence disappears is auto-dismissed (and its signature cleared); a CONFIRMED
review is never touched; a DISMISSED review is revived only when the evidence
signature changes. Called best-effort after worker self-complete, admin sign-off,
completion revoke, and a `DONE` task completion, plus lazily by the section-work
queue (`reconcileVenueSectionWork`).

**Confirm/dismiss.** `reviewSectionWork` validates transitions server-side —
CONFIRM/DISMISS only from `PENDING`, REOPEN only from `DISMISSED` (409 otherwise).
CONFIRM upserts `StaffSection` and stamps `CONFIRMED`; DISMISS only closes the
review; REOPEN puts a dismissed review back in the queue. A manual grant from the
Staff modal also dismisses any matching PENDING review so it cannot resurface.
UI: **TRAINING → STATUS** has a **SECTION REVIEWS** strip fed by
`GET /api/admin/section-work?status=ALL` with staff, section, source/evidence and
CONFIRM/DISMISS (plus a dismissed list with REOPEN); action failures (403/409)
show inline. The Staff edit modal shows pending sections as outlined
`PENDING REVIEW` chips while keeping the manual toggle a direct manager grant.

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/section-work` | GET | List reviews (`?venueId=&status=PENDING|CONFIRMED|DISMISSED|ALL`), lazily reconciling first. Guard `training.playbook.view` |
| `/api/admin/section-work/[id]` | POST | `{action: CONFIRM|DISMISS|REOPEN, note?}`. Guard `training.playbook.assign`. Venue-scoped for managers and to the ADMIN active venue |

`GET /api/admin/training/status` no longer returns or reconciles section reviews —
the section-work queue is the single path.

### Guide warnings + retraining (#130, built 2026-11)

The actionable layer on top of `Guide.version` / the stale completion badge. A
**warning** is one of: a stale completion, a missing required guide, a pending
manager sign-off (sign-off guide with no completion), an explicit retrain
request, an overdue retrain request (pending > 14 days), or an open
`FollowUp`. Dismissing closes the REQUEST only — it never deletes a completion.

- **`GuideRetrainRequest`** (additive model) — `venueId`, `staffId`, `guideId`,
  `reason String?`, `status PENDING|DONE|DISMISSED`, `requestedById`,
  `resolvedById?`, `resolvedAt?`, `note?`, timestamps + `deletedAt`; indexes
  `(venueId,status)`, `staffId`, `guideId`. Creating one also upserts a
  `GuideAssignment(reason: 'RETRAIN REQUEST')` so the guide lands in that
  person's My Guides/training list even when it did not previously apply.
- **Pure brain — `lib/guide-warnings.ts`** (Prisma-free, client-safe):
  `buildWarnings` (`MISSING | STALE | SIGN_OFF_PENDING | RETRAIN_REQUESTED |
  OVERDUE | FOLLOW_UP`), `warningReasonText` (plain English, deterministic
  dates), `filterWarnings`, `sortWarnings`, `groupWarningsByFolder`,
  `guideTrainingState` (one guide's red-highlight state, shared by the sign-off
  modal and worker card) and `warningSummary`. An explicit request always wins
  over the inferred stale/missing warning for the same guide — no duplicates.
- **Server — `lib/guide-warnings.server.ts`** does batched reads (fixed query
  count) reusing the same `guideSource` applicability predicate as the guide
  lists. `createRetrainRequests` validates venue + staff, only accepts
  PUBLISHED + tracked guides, skips an already-PENDING request
  (`ALREADY REQUESTED`), and writes request + assignment in one transaction.
  `resolveRetrainRequest` enforces PENDING → DONE/DISMISSED (409 otherwise).
- **Routes:** `GET /api/admin/guide-warnings` (`training.playbook.view`,
  MANAGER venue-locked to `session.user.venueId` — the SAME effective venue the
  write routes use; returns `canAssign` + `canSignOff`), `POST
  /api/admin/guide-retrain` and `PATCH /api/admin/guide-retrain/[id]`
  (`training.playbook.assign`). Worker mirrors: `GET
  /api/worker/guide-warnings` (all venue for managers/`training.playbook.view`,
  otherwise only the session person's own), `POST /api/worker/guide-retrain` and
  `PATCH /api/worker/guide-retrain/[id]` (managers/admins or
  `training.playbook.assign`, except the TARGET worker may always RESOLVE their
  own request; DISMISS still needs ASSIGN). `POST` on the admin route derives
  the venue from the target person when an ADMIN omits `venueId`.
  `retrainOptions` carries the person/guide picker for authorised staff, and an
  unresolvable guide is labelled `GUIDE REMOVED` with no OPEN GUIDE action.
- **UI:** `TrainingStatusClient` has a filterable/sortable **WARNINGS** section
  (kind, severity, folder, person; most-urgent/oldest/person/guide) with a
  FLAT / BY FOLDER toggle (`groupWarningsByFolder`), OPEN GUIDE, MARK RETRAINED
  (only with `training.playbook.signoff`; reuses the completion route and
  resolves the request), MARK FOR RETRAINING and DISMISS (both only with
  `training.playbook.assign`). `StaffGuidesModal` groups by folder with an
  **ALL GUIDES** flat toggle, red row + plain-English reason for
  stale/requested guides, and grant-gated MARK RETRAINED / MARK FOR RETRAINING /
  DISMISS WARNING (`canSignOff` / `canAssign` come from the staff-guides GET).
  `WorkerGuidesClient` (`/w/guides`) is now the bible/tree only — it has no
  warnings strip and no training-status link. It still shows a red guide card +
  red RETRAIN NEEDED reason where the guide is marked off. Warnings and
  training now live on the training status board (`TrainingStatusClient` /
  `/w/training-status`). The worker `/api/worker/guide-warnings` and
  `/api/worker/guide-retrain` routes still exist but have **no live worker UI**
  after this change (a staff own-training view remains out of scope).
- **Help:** the `guide-warnings` Heavenly Help article (TEAM / EVERYONE,
  sortOrder 620) covers the admin warnings list, folder grouping, retrain
  reasons and the red guide highlight. It ships with two screenshots:
  `/help/guide-warnings-admin.png` and `/help/guide-warnings-modal.png`.
- **Deploy note:** additive only. `prisma db push` creates the enum + table; no
  data migration or backfill is required.

### External embeds + calendar import + NZ breaks
Per-venue integration links live on `Venue` (`loadedRosterUrl`,
`googleCalendarUrl`, `icalFeedUrl`, `externalRefreshMinutes`,
`lastExternalSyncAt`), edited in Settings → Integrations (admin, or a venue's
own manager, via `PUT /api/admin/venues/[id]`).

Two mechanisms:
1. **Live embeds** — the Loaded roster + Google Calendar links render in iframes
   on the Calendar page's LOADED ROSTER / EVENTS tabs (auto-refresh, OPEN↗
   fallback). The Loaded "PublicRoster" URL is a token-gated SPA with no
   anonymous JSON/iCal feed, so it can only be embedded, not imported.
2. **Import onto the PLANNER** — the Google Calendar link (its derived
   `…/ical/…/basic.ics` feed) and any pasted `.ics`/webcal `icalFeedUrl` are
   fetched + parsed server-side (`lib/ical.ts` — no dependency; handles
   line-folding, all-day vs timed, UTC/naive times, and basic RRULE expansion
   within a ~−60/+400 day window) and stored as `CalendarEvent` rows. They show
   as `◆` events on the month grid + day modal. `lib/external-sync.ts`
   `syncVenueCalendar()` upserts by `@@unique([venueId, source, uid])` (changed
   events update in place) and soft-deletes events no longer in the feed (per
   source, only when that source fetched cleanly) — the "update, no double-up"
   guarantee. Triggered by `POST /api/admin/calendar/sync` ({venueId} → that
   venue; admin with none → all venues; manager → own), which the CalendarClient
   calls on opening the PLANNER and on the venue's refresh interval, plus a
   manual SYNC NOW button. `/api/admin/calendar` GET merges events into the
   per-day map and returns `lastSyncedAt`. Recurring events use a per-occurrence
   uid (`baseUid_YYYYMMDD`) so re-sync stays idempotent.

`lib/breaks.ts` computes NZ rest/meal break entitlements from shift length
(`formatBreaks(start,end)`), shown on each roster shift and as a reference table
in Settings.

### Calendar (roster + time off)
`Shift` (per-staff, per-date, `startTime`/`endTime` as local "HH:mm" strings) drives a
month calendar. `/api/admin/calendar?year=&month=&venueId=` returns a per-day map
of shifts + time-off (read from `StaffAvailability.timeOff`, not
`TimeOffRequest`) + imported events + a `dutiesRequired` flag (computed from task
schedules via `isTaskDueOnDate`) + `pendingCount` + `lastSyncedAt`. Admin manages
shifts (`/api/admin/shifts`) at `/admin/calendar`; pending availability
approvals banner-link to `/admin/team?tab=availability`. The PLANNER also shows
a live-floor list of who is currently clocked in (refreshed every 30 s). Staff
see their own upcoming PUBLISHED shifts and break entitlements at `/w/calendar`.
`TimeOffRequest` and `/api/admin/timeoff` + `/api/worker/timeoff` are **legacy** —
no UI calls them (time off is now a flag on `StaffAvailability`; the
`db:migrate-timeoff` script converts old rows). Times are local strings (no tz
math); dates are @db.Date keyed via `formatDateKey`. `lib/calendar.ts` has the
month/range/time-validation helpers.

### Availability, roster, clocks & payroll (Team hub, built 2026-08)

`/admin/team` (`TeamClient`) is the hub — tabs **STAFF · ROSTER · AVAILABILITY ·
CLOCKS · PAYROLL** (`lib/hub-tabs.ts` `TEAM_TABS`). `/admin/staff`, `/admin/roster`,
`/admin/clocks`, `/admin/payroll` are `hubRedirect()` stubs. There is no
`/admin/availability` page — availability is a Team tab.

**Availability** — `StaffAvailability` (one row per staff × date,
`@@unique([staffId,date])`) is the unified availability/time-off store:
15-minute `segments` windows, `type AVAILABLE | UNAVAILABLE | PREFERRED`
(PREFERRED = legacy casual opt-in), `timeOff` flag, `status PENDING | APPROVED |
DECLINED`, optional `seriesId`/`seriesEndDate` for weekly repeats (materialised
one row per occurrence, 104-week horizon when "no end"). Pure logic in
`lib/availability.ts` (70 tests — window algebra, `autoComplement` = anything
not AVAILABLE is UNAVAILABLE, free-window algebra (`freeWindows` /
`freeWindowsFrom` / `describeFreeWindows`), series helpers, presets, the weekly
request cut-off helpers). **A day's
state is judged by FREE time**: `availabilityState` returns `AVAILABLE` (free
all day), `PARTIAL` ("SPLIT" — free part of the day; a morning-only day must
never read as a blanket unavailable) or `UNAVAILABLE` (no free time), and the
admin availability pin + roster overlays count PARTIAL as available — for
today, only the free time still ahead of the current clock. Prisma work in
`lib/availability.server.ts` (23 tests — plan→execute model, cut-off gate). Workers declare at
`/w/availability` (`WorkerAvailabilityClient` + shared
`components/availability/`). AVAILABLE-only days auto-approve and stay editable;
any worker change touching an APPROVED UNAVAILABLE/time-off row is stored as an
`AvailabilityEditRequest` (scope THIS/FROM/ALL) for a manager to APPLY or
DISCARD. A **THIS** edit on a series day **detaches** it: the row is written
with `seriesId: null` as a standalone day, so later FROM/ALL changes to the
series no longer override it (detaching the final occurrence re-pins the
remaining series end via `AvailabilityPlan.syncSeriesId`). `/admin/team?tab=availability` (`AvailabilityAdminClient`) is the
review grid. The GET returns `today` computed in the **venue timezone** so the
TODAY marker / opening week are correct even when the venue is ahead of UTC; both
availability clients fall back to `localDayKey()` (`lib/date-nav.ts`, device-local)
— never the UTC `keyOfDay()` — for the initial default. Approvals are person-centred: only staff with pending work are
listed, and opening a person shows their declarations and edit requests with the
current day next to the proposed one. A request can target a day outside the
visible range: the GET also returns that day's current row, so the panel always
shows what is being replaced (never "not in range"). A manager can open either in
`AvailabilityDayEditor` (`proposalToEntry` in `lib/availability.ts` maps a stored
SET proposal to an entry) and save an admin override; a `MARK_APPLIED` action on
`/api/admin/availability/requests/[id]` then retires the request without running
its stored plan. FILTER STAFF narrows the grid only (never the approvals queue)
and groups with no matching staff are hidden. Notes show on worker month/week
cells, the admin grid, edit-request previews and worker pending-request cards.
Routes: `/api/admin/availability` (+ `/clear`, `/review` incl. `NOTE`, `/[id]`
PATCH notes/reviewNote/lock, `/requests/[id]`), `/api/worker/availability`
(`/[id]` PATCH notes;
the worker `/clear` and `/[id]` DELETE both return 403 — clearing is a manager
action — plus `/requests/[id]`). Guards:
`team.availability.view|edit|approve`.

**Day-level lock (#12/#14, narrowed #159)** — `StaffAvailability.lockedAt` /
`lockedById` / `lockedReason` (all nullable). Set manually from the admin day
editor (`LOCK` / `UNLOCK`, optional reason) and **automatically only for a
single day**: a `/review` APPROVE locks when it targets exactly one day (no
series), and applying a single-day `THIS` edit request locks that day. A series
or multi-day approval/apply never locks — series/future days are protected by the
weekly cut-off gate and the approved-UNAVAILABLE edit-request path instead, and
individual locks stay manual, single-day, detached rows. Applying an admin
override opened from a single-day declaration/request sends `lock: true` (a
series write never honours it). A plain grid override does not change the lock;
auto-approved pure-AVAILABLE worker saves never lock. A locked day:

- files a worker save as an `AvailabilityEditRequest` (same path as an
  approved block-out) — see `rowsTouchedByPlan` in `lib/availability.server.ts`;
- is **stripped** from admin writes and reported in `skipped`; a single-day
  write that only touched locked dates returns 409 `{ error: 'LOCKED — UNLOCK FIRST', locked: [...] }`;
- keeps **notes editable** via the notes-only PATCH (admin `/[id]` = `{ notes?,
  reviewNote?, locked?, lockedReason? }`, worker `/[id]` = `{ notes }` only),
  which never touches availability/status/lock fields;
- is skipped by drag-fill and bulk clear client-side (and by
  `cancelPendingAvailability`).

The shared `AvailabilityDayEditor` renders locked days read-only for admins
(`LOCKED — UNLOCK TO EDIT`, `UNLOCK`, comments still writable) and lets workers
submit a change request (`SEND CHANGE REQUEST`).

**Legacy review notes (#61).** `StaffAvailability.reviewNote` and
`AvailabilityEditRequest.reviewNote` are historical columns. The old separate
REVIEW NOTE inputs, the `✎ REVIEW` grid marker and the declaration card's
notes-only actions are gone; existing values are backfilled into the comment
thread. `POST /api/admin/availability/review` still accepts `action: 'NOTE'`
for compatibility, and `PATCH /api/admin/availability/[id]` still accepts
`reviewNote`, but the UI no longer calls either. A save that moves a row back to
`PENDING` (`executeSet` with `status: 'PENDING'`) clears
`reviewNote`/`reviewedAt`/`reviewedById`; admin overrides are `APPROVED` and
leave the review stamp alone.

**Comments replace the note areas (#152, built 2026-11).** Each staff member +
day now has one history thread in `AvailabilityComment` (`venueId`, `staffId`,
`date @db.Date`, optional `seriesId`, `body`, `source WORKER_APP | MANAGER |
SYSTEM`, optional `authorId`, unique `legacyRef` for the backfill, soft delete;
indexes `(staffId, date)` and `(venueId, date)`). The UI (`AvailabilityCommentThread`)
replaces the old WORKER NOTE / REVIEW NOTE inputs on the declaration card, edit
request card and `AvailabilityDayEditor`; rows are one line until expanded, show
author · source · time · body, and offer delete when the server allows it.
Sources are stamped automatically (`VIA APP` for workers, `MANAGER` for admin).
`StaffAvailability.notes` stays the current/latest comment (the grid, roster
overlay and worker month cells keep their cheap read) and every comment write
mirrors the newest live body back onto it. Managers can always delete; staff can
only delete their own when `Venue.staffCanDeleteAvailabilityComments` is true
(**default false** = managers only; toggled in Settings → GENERAL → ROSTER
AVAILABILITY). A multi-day declaration posts its comment to every affected day;
a restricted manager without `team.availability.edit` gets a read-only thread
(`canAdd` / `canDelete` from the GET), and an old request `reason` with no
matching comment is shown as a `LEGACY REASON` line. The confirm/decline review
flow, locks and the edit-request pipeline are unchanged.

Routes: `GET/POST/DELETE /api/admin/availability/comments` (GET
`team.availability.view`, writes `team.availability.edit`; MANAGER venue-locked,
ADMIN uses the `admin-active-venue` cookie; `?staffId=&date=`) and
`GET/POST/DELETE /api/worker/availability/comments` (worker JWT, own staff only,
`?date=`; DELETE 403 unless the venue toggle allows deleting their own comment).
`GET` returns newest-first comments + the effective per-comment `canDelete`; POST
caps the body at 500 characters. The idempotent `db:migrate-availability-comments`
(wired after `db push`, so it runs on every boot) converts the old `notes` /
`reason` / `reviewNote` columns on `StaffAvailability` and `AvailabilityEditRequest`
into comment rows with their original author + timestamp. It plans against every
existing comment (live **and** soft-deleted): an existing `legacyRef` is skipped;
a seed whose staff + day + body already exists is written as a soft-deleted
**tombstone** carrying its `legacyRef` (so a later boot can never duplicate a
normal comment or resurrect a deleted one); otherwise it creates a live comment.
**The boot pass never writes `StaffAvailability.notes`** — runtime comment writes
call `mirrorAvailabilityCommentNotes`, and a boot re-mirror would overwrite a
newer series note on a non-anchor day. Worker series saves store the comment on
the anchor day and show a caption that the latest note is applied to every day
the save writes.

**Dates are day-first (#152).** `lib/date-nav.ts` adds `formatDateDMY`
(`12-11-2026`) and `formatDateDayDMY` (`THU 12-11-2026`), and `formatDateShort`
is now DD-MM-YYYY (never `AUG 9, 2026`). The request popup shows the weekday +
DMY. Locale-less `toLocaleDateString()` calls were replaced with the shared
day-first helper so a US device cannot render `MM/DD/YYYY`.

**Worker series edits + removal requests (#59) + admin bulk clear (#13) +
weekly default (#7) + in-place refresh (#16)** - worker writes pass
`allowedScopes: WORKER_EDIT_SCOPES` (`THIS`/`FROM`), so a worker may detach one
day (`THIS`, `seriesId: null`, `syncSeriesId` keeps the remaining series end
correct) or apply the change to every occurrence from the clicked day onwards
(`FROM`, rows rewritten in place with the same `seriesId`; earlier days are
never touched). `ALL` is outside the worker policy and is clamped to `THIS`,
and an anchor before the venue-local today is rejected with a 400. The worker
editor hides `ALL` and `CHANGE SERIES END` and defaults a series edit to
`JUST THIS DAY` (`THIS`, the one-off detach); choosing `FROM` is a deliberate
series edit and shows `FROM <date> ONWARDS — PAST DAYS UNCHANGED`. A series day
also offers **`REQUEST REMOVAL`**, which
posts to `POST /api/worker/availability/series-request`: it validates the
series belongs to the session's staff member, files a `CLEAR`/`FROM`
`AvailabilityEditRequest` for future occurrences only, skips manager-locked days
into `skipped`, and **never deletes anything** (a duplicate pending removal for
the same series returns 409). `applyEditRequest` re-checks at APPLY time: a
target that is now past or manager-locked is left alone and reported in
`skipped`. If **every** target is skipped it writes nothing, keeps the request
`PENDING` and reports `LOCKED — UNLOCK FIRST` (or `ALL DAYS ARE IN THE PAST`)
instead of silently retiring it; a partial apply writes the remaining days and
reports `skipped` + `wrote`. A newer pending request for the same day+action (or
series+action) marks the older ones `SUPERSEDED` (`SUPERSEDED` was added to
`AvailabilityRequestStatus`), and confirming a declaration supersedes any pending
request whose whole target set it covers. **Workers edit a day, they never clear it**: the worker UI has no
per-day `CLEAR` and no `SELECT DAYS` bulk clear, and
`/api/worker/availability/clear` plus `DELETE /api/worker/availability/[id]`
stay 403. Only the admin grid supports
**bulk clear** (shift-click a range on one staff row, or `SELECT DAYS`, then
`CLEAR SELECTED (n)` with confirmation); clearing loops the existing `/clear`
route one day at a time with `scope: 'THIS'` (no bulk API). Users with
`team.availability.edit` also get **`LOCK SELECTED (n)`** and
**`UNLOCK SELECTED (n)`** beside clear: a small confirmation modal takes an
optional reason for locking, then loops
`PATCH /api/admin/availability/[id]` with `{ locked: true, lockedReason }` (or
`{ locked: false, lockedReason: null }` to unlock) for each populated selected
day (blank and already in the target state are skipped and counted). There is
no bulk-lock/bulk-unlock API and no worker-side lock action.
Selection is one row/range and clears on navigation. `+ ADD WINDOW` uses
`addWorkingWindow` so a day whose windows already cover all 24 hours (where a
plain `addWindow` would silently no-op) gains an editable row. A non-normalised
split is edited through `addWindow`, so moving the new row's edge opens a real
gap that persists instead of merging straight back.

**Popup has no CLEAR; ADMIN series delete.** The day editor
(`AvailabilityDayEditor`) no longer renders a CLEAR button (worker or admin) —
clearing is main-screen only (`SELECT DAYS` → `CLEAR SELECTED (n)`). A series day
gets **`DELETE SERIES`** for **ADMIN** only, opening a warning modal with
`JUST THIS DAY` / `FROM THIS DAY ONWARDS` / `WHOLE SERIES`. It posts to
`POST /api/admin/availability/delete-series` (strict ADMIN; reuses
`clearAvailability` with `bypass`, soft-deletes), skips locked days (reported as
`skipped`) and dismisses pending `AvailabilityEditRequest` rows for the removed
dates. Managers keep the grid clear; the old `/clear` route is unchanged. The
admin review card labels a CLEAR request by its scope — `CLEAR THIS DAY` /
`REMOVE SERIES FROM THIS DAY` / `REMOVE WHOLE SERIES`.

The worker view
defaults to **WEEKLY** and remembers the toggle in
`sessionStorage['hospo-worker-availability-view']` (validated, falls back to
week). Live pages refresh in place: `AvailabilityAdminClient` and `RosterClient`
keep the previous payload mounted and show `REFRESHING…` on save-triggered
reloads, restoring scroll via `lib/use-scroll-restore.ts`
(`captureScroll` / `restoreScroll` + `useScrollRestore()`); keyed containers use
`data-scroll-key`. `lib/cell-fill.ts` also exports `dayRange` /
`toggleSelection` for the selection logic.

**Weekly request cut-off** — `Venue.availabilityCutoff Json?`
(`{ day: 0-6 (Sun-Sat), time: "HH:mm" }`), set in Settings → GENERAL →
ROSTER AVAILABILITY. For each roster week the deadline is the chosen weekday +
time in the week *before*; once it passes, a worker's save for that week files
an `AvailabilityEditRequest` even when no protected row is touched
(auto-approval stops). Pure helpers `parseAvailabilityCutoff` /
`cutoffDeadlineKey` / `isPastCutoff` / `describeAvailabilityCutoff` + the
`planPastCutoff` gate check (gate carries `cutoff` + venue-local `nowMinutes`).
The worker GET returns `cutoff` and the phone shows a deadline banner. Admin
writes bypass it.

**Worker session timeout** — `Venue.workerSessionTimeoutMinutes Int? @default(15)`
is the phone inactivity limit, set in Settings → GENERAL → WORKER SESSION
(5–480 minutes; blank/0 = env fallback). It drives the JWT `exp`, the cookie
`maxAge`, and the client guard from one resolver (`lib/worker-session-timeout.ts`).
An active phone slides its own session via `POST /api/worker/session/refresh`;
going idle signs out to `/w/login`. Admin sessions are untouched.

**Drag-fill (admin only)** — every day with an entry carries a corner handle on
the admin availability grid. Dragging it opens a confirmation modal, then copies
that day's settings across a day range (same person) by looping
`POST /api/admin/availability` per target day. If the source day is part of a
weekly series, the modal also offers **JUST THESE DAYS** (standalone copies) or
**WEEKLY SERIES** (weeks / no-end, starting from the first dragged day). The
worker availability view has no drag-fill — workers tap a day to edit. Rectangle
hit-testing is the shared `lib/cell-fill.ts`.

**Roster** — `/admin/team?tab=roster` (`RosterClient`, 14 tests): week/day grid,
staff grouped by derived Position (drag headers; persisted `Position.sortOrder`),
DRAFT/MIXED/PUBLISHED week status (`ShiftStatus`; only PUBLISHED shifts reach
workers) with bulk publish via `POST /api/admin/roster/publish`, shift modal
(role/colour/tag/break/note/optional linked event), soft warnings for
availability conflict + role readiness (never blocking), PDF export
(`lib/roster-pdf.ts`), and a footer showing paid hours/cost vs budgeted REVENUE
(staffing ratio — `lib/roster-math.ts`, 14 tests; `lib/staff-rate.ts` resolves
StaffPosition → Position → Staff rate). Availability overlays show SPLIT days
with their free windows; **click a day header to pin it** — people with free
time that day float to the top of their group (`sortByPinnedAvailability`), and
for today only the time still ahead counts. Every shift block carries a
**drag-fill handle** (top-right, appears on hover) — drag it to copy the shift
across days and down/up staff rows in one gesture (time-off cells are skipped;
blocked targets are silently left alone). Both copy-fill and moving a shift open
a confirmation modal before writing. The block itself is draggable onto
another person/day to **move** the shift — `PUT /api/admin/shifts/[id]` now
accepts `staffId` (venue-checked, and the department follows the new person).
Creating a shift defaults Role to the person's top-ranked Position; editing
loads the shift's own role and note (the roster payload now carries `note`).
Rectangle math in `lib/cell-fill.ts`. Routes: `GET /api/admin/roster`,
`POST /api/admin/roster/publish`, `POST/PUT/DELETE /api/admin/shifts(+/[id])`.

**Roster hour targets (#139, built 2026-11).** `Staff.minHoursPerWeek` (contract
minimum), `Staff.wantedHoursPerWeek` (casual requested) and
`Staff.targetHoursPerWeek` (admin aim) are additive `Float?` columns edited in
the Staff form under ROSTER HOURS PER WEEK. The roster staff column shows the
scheduled paid hours against them: red under the minimum, warning under the
highest soft goal, green when met/over. The status chip is shown in **WEEK
view only** — a day-view total is one day, not a week, so it would be
misleading. `lib/roster-hours.ts` (pure) owns `hourGoals`, `hourTargetStatus`
(none / under-min / under-goal / met / over), `describeHourTargets`,
`parseHourTarget` and `hourStatusTone`. **These values never affect payroll** —
planning visibility only.

**Roster week templates + copy (#139, built 2026-11).** `RosterTemplate`
(venueId, name, notes) + `RosterTemplateShift` (staffId, positionId, `dayIndex`
0=Monday…6=Sunday, times, break, colour/tag/note, sortOrder, soft delete).
Deleting a template stamps `deletedAt` on its shifts in the same transaction.
Staff/position ids are plain strings so a purged person degrades to a reported
skip. **TEMPLATES** saves the displayed week normalised to Monday–Sunday;
**APPLY** writes DRAFT shifts into a target week in **ADD** or **REPLACE** mode
(REPLACE asks for confirmation, soft-deletes the target week — including
published shifts — and releases its open-shift seats). **COPY WEEK** does the
same directly from the displayed week. Missing/inactive staff are skipped and
reported; a template position that no longer exists is nulled and reported as
`clearedPositionIds`. `lib/roster-template.ts` is the pure mapping
(`dayIndexFromDate`, `dateForDayIndex`, `normaliseWeekToTemplate`,
`buildTemplateWeekRows`, `buildCopyWeekRows`); `lib/roster-week.server.ts` owns
the transactional write. Routes: `GET/POST /api/admin/roster/templates`,
`DELETE /api/admin/roster/templates/[id]`,
`POST /api/admin/roster/templates/[id]/apply`, `POST /api/admin/roster/copy`.

**Working slots (#139, built 2026-11).** `RosterSlot` (venueId, name,
positionId?, start/end, break, `headcount` 1–50, colour/tag, isActive,
sortOrder) is a reusable shift preset — role + time + headcount, **not** an
unassigned requirement layer. **SLOTS** in the roster toolbar creates/edits/
deletes them and **PLACE** puts one on a chosen day for the selected staff,
creating one DRAFT shift per person. Fewer staff than the headcount leaves
unfilled seats (reported); more is rejected. A slot position that no longer
exists is nulled on the created shifts and reported as `clearedPositionId`.
`lib/roster-slot.ts` (pure) owns
`validateRosterSlot`, `planSlotPlacement` and `describeRosterSlot`. Routes:
`GET/POST /api/admin/roster/slots`, `PUT/DELETE /api/admin/roster/slots/[id]`,
`POST /api/admin/roster/slots/[id]/place`. All roster template/slot writes use
`team.roster.edit`; reads use `team.roster.view`.

**Areas + event staffing + open shifts (built 2026-10, reworked 2026-10).**
`Area` is a physical event space (name, colour, optional floor-plan link,
optional capacity, order, notes) that **exists without a calendar**: zero or
more `CalendarFeed` rows attach via `CalendarFeed.areaId`. Areas are managed in
**Events → ROOMS & PLANS → ROOMS** (`RoomsPanel`, `/api/admin/areas` CRUD +
`/reorder`), where each feed row also picks its area; a multi-`src` Google embed
still expands to one feed per calendar. (The old Settings → GENERAL → INTEGRATIONS
block still renders for compatibility; the Events panel is the canonical home.)
`db:migrate-areas` (wired into `docker-entrypoint.sh`
after db push) creates one area per existing feed and backfills
`CalendarEvent.areaId`; `external-sync.ts` stamps `areaId` on imported events
and prefers the area's floor plan, so the worker floor plan auto-switches.

The ROSTER tab's **STAFF / EVENTS toggle** renders the **same interactive staff
grid** for both tabs — EVENTS only adds event chips to the day headers
(time · title · area · pax · fill count; click one to open the staffing modal)
plus SYNC CALENDARS / CLAIMS / + NEW EVENT in the toolbar. Manual events are
`CalendarEvent` rows (`source: MANUAL`) created/edited from the shared
`CalendarEventFormModal` (Calendar PLANNER day modal and the roster), with
title, description, area, date/time (an end at/before the start rolls to the
next day), all-day, pax (over-capacity is a warning, never a block), external
PDF link + uploaded PDF (`/api/admin/calendar-events/[id]/attachment`, same
storage pattern as guide attachments), and required-staff lines. APIs:
`POST /api/admin/calendar-events`, `GET/PUT/DELETE
/api/admin/calendar-events/[id]` (PUT/DELETE are manual-only — imported events
are read-only; edit them in the source calendar). The Calendar PLANNER day
modal also keeps the imported-event floor-plan link.

Clicking an event chip opens `EventStaffingModal`: requirement lines
(`EventStaffing` — position or free-text label, count 1–50, times, break, note;
`StaffingLinesEditor` is shared with the event form), **FIND STAFF** (confirms
and creates `OpenShift` seats, one row per headcount — `expandSeats` in
`lib/open-shifts.ts`, 12 tests), the listed seats with their claims
(APPROVE/DECLINE), and **ROSTERED SHIFTS** — every `Shift` with
`calendarEventId` set, badged CLAIMED (came from an approved claim) or ASSIGNED
(manual link; the shift modal has an EVENT select on the EVENTS tab), with who
holds it and DRAFT/PUBLISHED status. `reviewOpenShiftClaim` stamps
`calendarEventId` on the created DRAFT shift and fills the seat. **Manual
roster links consume seats too**: creating/editing a shift with an event
(`syncShiftSeatLinks`) fills a matching OPEN seat (`fillSeatForShift` — exact
time + role first, then role, then time, then any); deleting it or clearing the
event link releases the seat (`releaseSeatForShift` declines its APPROVED claim
so the worker can re-claim), and moving the shift to another person updates the
seat holder. Workers with a matching position
(or seats with no role) see claimable seats on `/w/shifts`
(`WorkerShiftsClient`), CLAIM with an optional note (`OpenShiftClaim`
PENDING). Worker schema/lib
tests: `lib/open-shifts.server.ts` (27 tests). Guard:
`team.roster.view|edit|approve` (approve = claims). The worker
`GET /api/worker/calendar` also returns `openShiftCount` for the dashboard PICK
UP SHIFTS tile. Manual-event pax/PDF/description detail stays manager-side.

**Clocks** — `TimeClock` (+ `TimeClockBreak`, `TimeClockEdit` audit rows) with
optional per-shift `positionId`, geo fields (`clockInLat/Lon`, `geoValid` via
`lib/geo.ts` haversine fence — advisory only), `source WORKER | ADMIN`,
`approvalStatus PENDING | APPROVED | REJECTED`, cached `breaksMinutes`. Worker
UI at `/w/timeclock` — clock in/out with best-effort geolocation, break timer,
recent sessions; one active session per person is enforced in the API (not a DB
index). Admin at `/admin/team?tab=clocks` (`ClocksClient`, 5 tests) lists
sessions, approves/rejects (optional reason), and edits with a per-field audit
trail. Guards: `team.clocks.view|manual|approve`.

**Payroll (NZ)** — `PayPeriod` (`OPEN`/`CLOSED`, re-closing deletes + recalculates
entries), `PayrollEntry` (full NZ breakdown: ordinary/overtime/public-holiday
hours, gross, holiday pay, annual-leave accrual, alt days owed, PAYE, ACC, KiwiSaver,
student loan, net, employer cost, `breakdown Json` per session),
`PayrollSettings` (per venue: frequency, minimum wage, ACC rate, KiwiSaver,
student loan, holiday-pay %, tax code, overtime toggle/threshold/rate),
`PublicHoliday` (venueId null = national; 2026–27 seeded), `AlternativeDay`
(day-in-lieu ledger). Pure engine `lib/nz-payroll.ts` (26 tests —
PAYE brackets, secondary tax codes, ACC/KiwiSaver/student loan,
`payrunForStaff`) + `lib/payroll.ts` (6 tests — reads APPROVED closed sessions
and replaces entries/alt-days in one transaction). PH hours paid 1.5× and accrue
one AlternativeDay per PH date worked; casuals get 8% holiday pay paid out;
permanents accrue 4/52. `/admin/team?tab=payroll` (`PayrollClient`) has PERIODS ·
PUBLIC HOLIDAYS · ALT DAYS · SETTINGS tabs, CLOSE PERIOD, MARK PAID, CSV/HTML
export, payslip modal. Staff record tax code / KiwiSaver / student loan on the
Staff form. Guards: `team.payroll.view|close|markpaid|export`. **Guidance, not
compliance-grade** — code comments say reconcile against IRD.

**NZ breaks** — `lib/breaks.ts` (13 tests) computes rest/meal entitlements from
shift length (Employment Relations Act 2000 s69ZD), shown on roster shifts and
worker schedules. Two known engine gaps: `nz-payroll.classifyBreakMinutes` is
tested but not called by `payrunForStaff` (all clocked break minutes are
deducted as unpaid), and `payroll.calculateStaffHours` is only used by tests.

### Booking system (Phase 5, built)
`Booking` + `BookingTable` models drive a table reservation system with floor plan
integration. `Booking` holds date, start/end time (local "HH:mm"), party size,
contact details, source (ONLINE/PHONE/WALK_IN/WOOCOMMERCE), and status
(CONFIRMED/PENDING/CANCELLED/SEATED/COMPLETED/NO_SHOW). `BookingTable` is a
junction linking bookings to `SetupItem` (specific tables).

**Availability engine:** `lib/booking-availability.ts` exports pure functions
(`checkAvailability`, `getAvailableTables`) that filter booked tables from
overlapping time slots. `GET /api/admin/bookings/availability` exposes this as
an endpoint, accepting date, time range, party size, and venue ID — returns
per-setup available table count and total capacity.

**Auto-seat on create:** `POST /api/admin/bookings` reuses `planAutoSeat()` from
`lib/auto-seat.ts` with greedy bin-packing. On create it fetches the chosen
`FloorPlanSetup`, collects existing tables + booked tables, runs the bin-packer,
and creates `SetupItem` + `TableGroup` rows automatically. Also creates a
`CalendarEvent` (MANUAL source) for calendar visibility with floor plan linking.

**Admin page:** `/admin/ops?tab=bookings` (the `/admin/bookings` stub redirects) — time-grid diary view (06:00–24:00 in
half-hour increments) with booking cards showing contact, party size, duration,
table assignments, and colour-coded status. Date navigation, venue selector,
+ NEW BOOKING modal with availability check, inline STATUS changes, and
soft-delete.

**API routes:**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/bookings` | GET, POST | List by date+venue; create with auto-seat |
| `/api/admin/bookings/[id]` | PUT, DELETE | Update fields/status; soft-delete |
| `/api/admin/bookings/availability` | GET | Check per-setup capacity for date/time/party |

**Integration:** Bookings create `CalendarEvent` rows (source: MANUAL) and
`FloorPlanSetup` rows linked via `calendarEventId` — the same chain used by
WooCommerce auto-seating. This means bookings appear on the calendar, the FOH
view, and the worker floor plan view with auto-switching layouts.

**Two booking views:** DIARY (time-slot list 06:00–24:00) and TABLE (tables down
left grouped by section, 15-min time columns across top). TABLE view supports
click-to-create, drag-edge-to-resize, and colour-coded booking blocks. New
bookings auto-select the first available Room/Setup for table assignment.

**Services (bookable windows).** `Service` (venue-scoped, optional
`wooCategoryId`, `bookableTimes Json` override, `bookingIntervalMinutes`,
`tablePlanSetupId` — seating resolves against this layout), `ServiceSlot`
(weekly day-of-week windows + `maxCovers`), `ServiceException` (one-off date
override / closure). Pure `lib/service-schedule.ts` (19 tests — exception
overrides weekly, cover totals), `lib/service-windows.ts` (20 tests — merged
windows, bookability), `lib/service-seating.ts` (11 tests — capacity gate +
bin-packer keyed by `furnitureKey`). Admin editor at
`/admin/ops?tab=menu&sub=services` (`/admin/services` redirects);
`GET /api/public/config` + `GET /api/public/availability` expose them to the
Woo plugin; `POST /api/public/bookings` is the booking-only widget path.

**Backup/export:** `GET /api/admin/backup` streams a tar.gz containing `data.json` (all
venue-scoped models, active and soft-deleted) plus `uploads/` files. `GET /api/admin/seed-export`
returns a SQL-like dump of active venue data for seeding new instances. Both exclude demo venue
data and are admin-only.

**Customer database:** `/admin/ops?tab=customers` — searchable table by phone or name, detail
popup with contact info and booking history per customer. This view still groups bookings by
phone; the richer `Customer` model (see "Orders Rework — Phase 1") is used by orders, not yet
by this page. Past bookings show status, date, party size, and tables.

### Events / BEO (Banquet Event Orders) — built 2026-08

`Event` is the single event model — an **enquiry is just an Event with
`status: ENQUIRY`** (no second table). Status flow:
`ENQUIRY → DRAFT → TENTATIVE → CONFIRMED → IN_PROGRESS → COMPLETED`
(plus `CANCELLED`). Nothing downstream (booking, calendar event, layout,
pre-order) is created until it is **CONFIRMED and pushed**.

**Blocks** — an event is a list of `BeoBlock` rows (`type String`, `config Json`,
`sortOrder`) so a new block type is a library entry, not a migration:
`lib/beo-blocks.ts` (32 tests) defines 14 built-ins (CUSTOMER_DETAILS,
DINING_STYLE, MENU_SELECTION, DRINKS_SELECTION, DIETARY, ROOM_SETUP, TIMELINE,
STAFFING, VENDORS, TRANSPORT, PAYMENT, NOTES, HISTORY, CUSTOM_TEXT). Fields can
bind to Event columns (`eventField`); `stripBoundFields` stops bound keys
shadowing the row; `normaliseConfig` backfills but never drops unknown keys.
Venues author custom block types via `BeoBlockDef` (`/api/admin/beo-block-defs`).
`BeoBlockLink` attaches guides/tasks/checklists to a block **area** (polymorphic
`targetId`, no FK — a purged target simply disappears). Admin keeps blocks in
the builder (`EventBuilder` + `BeoBlockEditor` / `BeoBlockLibrary` /
`BeoBlockReferences`), plus `BlockLibraryPanel` for custom defs. The event header
and the `ROOM_SETUP` block render the selected setup as a `RoomSetupCard` (room
label, pax/style, photos, and a table-plan thumbnail) — see "Room setups".

**Templates** — `BeoTemplate` (`venueId null` = built-in global; blocks stored
as JSON without ids). One venue template can be flagged `isMaster` — the enquiry
intake form (`/api/admin/event-templates/[id]/master` demotes the incumbent in a
transaction). From-event snapshots via `/api/admin/event-templates/from-event`.
`/admin/events` tabs (`EVENTS_TABS`): ENQUIRIES · EVENTS · **PIPELINE** ·
TEMPLATES · REQUESTS · BLOCK LIBRARY. PIPELINE (`PipelinePanel`, 2 tests) is a
7-column status board; selecting a card shows the **auto-derived flow**
(`lib/event-flow.ts`, 6 tests — PLANNING/PREP/EVENT DAY from areas, linked
tasks/checklists and timeline rows; no authored graph).

**Pricing** — `lib/event-pricing.ts` (10 tests) prices menu blocks against live
`MenuItem.price` (duplicate lines merged; a purged product is skipped, never
priced $0).

**Customer share link** — `POST /api/admin/events/[id]/share` mints a token
(stored **hashed**, sha256; raw URL shown once; rotating invalidates the old
one), rendered at `/e/[token]` (`EventShareClient`). `lib/event-share.ts`
(8 tests) is an explicit **deny-list** — `STAFFING`/`NOTES`/`HISTORY` are never
public; `internalNotes` is never copied. Customers can submit EDIT / APPROVAL /
SIGN_OFF requests (`BeoChangeRequest`); managers resolve them at
`/admin/events?tab=requests`; an accepted APPROVAL/SIGN_OFF stamps
`customerApprovedAt/ByName`. All changes append to `Event.history` (append-only
JSON log).

**PDF** — `GET /api/admin/events/[id]/pdf?variant=full|client|kitchen`
(`lib/beo-pdf.ts`, 11 tests): KITCHEN re-sorts dietary first, CLIENT uses an
allow-list, HISTORY always omitted.

**Push to bookings** — `POST /api/admin/events/[id]/push`
(`lib/event-booking.ts`), idempotent by `(venueId, MANUAL, uid event-<id>)`:
upserts a `CalendarEvent`, seats on the service's `tablePlanSetupId` → event
`setupId` → "unseated" warning, creates/updates a `Booking` **in place**
(tables replaced wholesale), creates a pre-order `WooOrder` (source MANUAL,
`M-####`) from priced blocks, and links everything back. `Event.pushToBookings`
is off by default.

**Worker access** — managers always; floor staff need `events.events.create` or
`events.events.edit` (`lib/worker-event-access.ts`). `/w/events`
(`WorkerEventsClient`) is a stacked, click-to-add block builder (no drag) with
the same SAVE / CONVERT / PUSH / PDF actions, calling `/api/worker/events*`.

**API routes:** admin `events` (+ `[id]`, `/blocks`, `/convert`, `/push`,
`/share`, `/pdf`), `event-templates` (+ `[id]`, `/apply`, `/master`,
`/from-event`), `event-requests` (+ `[id]` PATCH), `enquiries`, `beo-block-defs`
(+ `[id]`), `beo-block-links`, `beo-references`, `services` (+ `[id]`). Public
`events/[token]` + `/request`. Worker mirrors of the above under
`/api/worker/events*` + `/api/worker/enquiries`.

### Staff attendance events — RSVP + calendar invites (#131, built 2026-11)

A **staff event** (staff get-together, training, briefing) is deliberately
separate from the customer/BEO `Event` and from `Shift`/`OpenShift`. Accepting an
invite **never** creates or changes a roster shift.

**Models (3):** `StaffEvent` (`venueId`, title, description, location, `startsAt`,
`endsAt`, `allDay`, `attendanceRequired`, `allowMaybe`, `requireDeclineReason`,
optional `responseDeadline`, notes, `status DRAFT|PUBLISHED|CANCELLED`,
`createdById`, `reminderSentAt`, soft delete), `StaffEventAudience`
(`kind` = the shared `AudienceKind` DEPARTMENT/SECTION/POSITION + `targetId`),
`StaffEventInvite` (`staffEventId` + `staffId` unique, `response PENDING|ACCEPTED|
DECLINED|MAYBE`, `respondedAt`, `reason`, `reminderSentAt`, soft delete).
`Notice.staffEventId` is a **unique nullable** link: one Notice per event.

**Publishing is the delivery step.** Create/update materialises one
`StaffEventInvite` per targeted active staff member via the pure
`resolveStaffEventTargets` (audiences unioned with explicit invitees; no
audiences and no explicit people = whole venue). A DRAFT stores invites but
sends nothing. Publishing sets `PUBLISHED`, creates/updates the linked Notice —
**pinned, IMPORTANT, `requiresAck: false`** (the RSVP is the acknowledgement)
with `endsAt` = the event end, mirrors `StaffEventAudience` to `NoticeAudience`,
and materialises invites. The worker notices route delivers a staff-event
notice **only to people with a live invite**, so a whole-venue notice cannot
leak an explicit-only invite.

**Invites are snapshots of who was targeted at save/publish time.** A person
hired *after* an event is published is **not** invited automatically: edit and
re-save the event (or publish again) to materialise them. Every admin save
re-materialises invites, including a DRAFT, so editing specific people is not
deferred to publish.

**Audience changes retain people.** Responded invites are never removed.
When a manager saves a changed target set, PENDING invitees who are no longer in
an audience or the explicit list are soft-deleted; leaving the explicit list
unspecified on an API call derives it from the rows already present so
historical clients do not drop people. Clearing **all** specific people on an
audience-less event falls back to whole-venue targeting.

**Responses.** Accept/Decline always; Maybe only when `allowMaybe`. The window
is `responseDeadline`, else `endsAt`, else `startsAt`; staff can change their
answer until it closes. `requireDeclineReason` makes a reason mandatory for
DECLINE. **Dates are venue-local wall clock stored in UTC fields** (the roster
convention), so window/notice comparisons use `wallClockNow(now, venue.timezone)`
— never a real-UTC `new Date()` against a stored wall-clock deadline. All of this
is pure in `lib/staff-events.ts` (`buildStaffEventFields`,
`validateStaffEventResponse`, `wallClockNow`, `attendanceFor`,
`resolveStaffEventTargets`, `buildStaffEventIcs`) and is re-validated
server-side.

**Worker UI.** `/w/notices` renders a first-class staff-event card
(`StaffEventNoticeCard`) with the full details inline, large ACCEPT / DECLINE
buttons (MAYBE only when allowed), the current answer, a change-until-deadline
hint, reminder treatment and **ADD TO CALENDAR** once accepted. Opening
**FULL DETAILS →** goes to `/w/staff-events/[id]` (same card, standalone).
`/w/calendar` lists upcoming staff events with the person's response; admin
`/admin/calendar` shows staff events as a separate `▲ STAFF EVENT` chip, its day
modal lists them, and both calendars keep shifts/imported events untouched.

**`.ics` invite.** `GET /api/worker/staff-events/[id]/ics` is worker-session and
invite-checked; it emits title, times (all-day = DATE values with exclusive
DTEND), location, description and organiser. Timestamps are **floating local**
(no Z) because the stored values are venue wall clock. Accepting never writes a
Shift.

**Admin UI.** **Team & execution → Notices** gains a **STAFF EVENTS** tab
(`StaffEventsPanel`): create/edit (title, description, location, date/times,
all-day, required/optional, Maybe, decline reason, response deadline, notes,
audiences + specific people), DRAFT/PUBLISHED, attendance counts
(YES/NO/MAYBE/NO REPLY), a per-person attendance popup with decline reasons,
**REMIND NO-REPLIES** (in-app only: stamps `reminderSentAt` on the event and
every pending invite), delete, and **⬆ IMPORT FROM EMAIL**. Changing the
audience later keeps existing invites so a response is never lost; PENDING
invites for people no longer targeted are soft-deleted. No new sidebar entry —
it lives in the existing Notices hub.

**Import from email (#89 framework).** `lib/import/staff-event.ts` builds the
copy-paste LLM prompt and tolerantly parses the answer (title, date, times,
all-day, location, description, required/Maybe/decline flags, optional
audience `DEPARTMENT:` / `SECTION:` / `POSITION:` name). `ImportModal` previews
and inline-edits the row, matching an existing event by **title + date**.
`GET/POST /api/admin/import/staff-events` resolves audience names against the
venue and creates **DRAFT** events (never published automatically), reporting
unknown audiences as warnings. Imported events are created with **no invite
rows**: publishing materialises a known audience. An unrecognised or missing
audience gets a loud `NOBODY WILL BE INVITED` warning and publish is blocked
(`409 SET WHO IS INVITED BEFORE PUBLISHING`) until the manager sets an audience
or specific people, so a typo can never invite the whole venue. One suggested
audience per imported event is supported (`DEPARTMENT:`, `SECTION:` or
`POSITION:` name); specific people and extra audiences can be added in the
editor after import. The manager reviews the list and clicks PUBLISH.

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/staff-events` | GET, POST | List with attendance counts / create (publishes by default, `publish: false` = draft) |
| `/api/admin/staff-events/[id]` | GET, PUT, DELETE | Detail + invites / edit + resync notice+invites / soft-delete event+notice+invites |
| `/api/admin/staff-events/[id]/publish` | POST | Publish a draft, materialise invites, send the notice |
| `/api/admin/staff-events/[id]/remind` | POST | Stamp `reminderSentAt` on the event and every pending invite |
| `/api/worker/staff-events/[id]` | GET | Invited worker's event view |
| `/api/worker/staff-events/[id]/respond` | POST | Accept/Decline/Maybe with server-side window + reason validation |
| `/api/worker/staff-events/[id]/ics` | GET | Downloadable `.ics` for an invited worker |
| `/api/admin/import/staff-events` | GET, POST | Import refs + existing events / create DRAFT events from reviewed rows |

**Guards:** admin routes reuse `notices.notices.view` (GET) and
`notices.notices.post` / `.delete` (writes), because the feature lives in the
Notices hub; MANAGER is venue-locked. Worker routes use the worker JWT and the
invite row, not a manager grant. **Deploy note:** additive schema only — let
`prisma db push` create the three tables and the unique `Notice.staffEventId`
column; no data migration is needed.

### Floor planner (Phase 1 + 2, built)
To-scale venue layout editor using **PixiJS v7** canvas (migrated from Konva 2026-06 — Konva's
draggable+React caused unresolvable event target and race condition bugs). Admin creates floor
plans with room dimensions (real cm). Elements are drawn using drawing modes (WALLS,
SECTIONS) directly on the canvas. Tables are created and managed from the **inventory module**
(`/admin/ops?tab=inventory` → FURNITURE/TABLES category), not from a drag palette. Elements are drawn
in real cm; room.scale transform handles zoom/pan (no per-element scaling). Canvas fills
available space via ResizeObserver.

**Canvas features:** middle-click pan, mouse-wheel zoom (0.2x–5x centered on cursor), zoom
slider in toolbar via `FloorplanToolbar`. Element drag uses pointer-delta (captured start
position + delta) — tracks cursor reliably at any speed. Multi-select via Shift/Ctrl+click +
rubber-band rectangle. Edge-aware grid snapping (snaps to nearest grid line — left OR right
edge). GRID snap ON by default. Rotation via preset buttons (0°/45°/90°/135°/180°/270°).
Global text scale slider (0.5x–3.0x). Per-type styled rendering (table with legs, chair as
bracket `[` shape, door with swing arc, booth bench with cushion inset, etc.). Bracket `[`
is the default chair style with per-side checkboxes (T/B/L/R) and 5cm gap from table edge.

**Dimension overlay:** Toggleable `[ ] DIM` mode in toolbar — draws architectural `|--30--|`
style width/depth lines outside a selected element's bounding box in blue with monospace labels.

**Right-panel inspector:** `FloorplanInspector` replaces raw number inputs with width/depth
range sliders (20–500cm) and preset buttons (`60×60`, `80×80`, `120×60`, `200×100`). For
polygon booth benches, shows Seat Capacity input, linked table checkboxes, and an
AUTO-CALCULATE button (2 seats per linked table).

**Section zones:** coloured rectangles drawn on canvas with 0.06 fill / 0.4-0.6 border opacity,
section name watermark, saved as JSON on FloorPlan. Element section grouping overlay (coloured
border + faint fill when element matches a zone's sectionId). SECTIONS mode button gates zone
drawing/drag — zones non-interactive otherwise. Zone resize handles (8 white squares — TL/TC/TR/
ML/MR/BL/BC/BR — drag to resize, grid-snapped). Zones with auto-rotated watermark for portrait
orientations. Per-element/zone labelScale input.

**Data flow:** Bulk SAVE sends all elements as one PUT to `/api/admin/floorplan/[id]/elements`,
which diffs incoming IDs vs existing DB IDs — soft-deletes removed elements, updates existing,
creates new ones (all in one
transaction). Response includes `_clientId`→real-ID mapping so local state updates consistently.

**Save validation:** Deduplicates table labels within the plan — no two TABLE elements
can share the same label.

**Multiple views** per venue (slug-based, one default). Workers see a read-only PixiJS canvas
at `/w/floorplan` with zoom/pan enabled and a view switcher if venue has multiple plans.
Calendar events can link to a floor plan (admin event modal selector); worker auto-switches
to the event layout with banner: "EVENT MODE — [Name] LAYOUT ACTIVE".

**Undo/redo:** Ctrl+Z / Ctrl+Shift+Z pushed on add, delete, drag-end, transform-end.

**Export:** PDF export renders canvas to PDF with date/venue header via jspdf.

**Key architecture:** `FloorPlanPixiCanvas` component contains the PIXI.Application. Room
transform via `room.scale + room.position` (no manual `* scaleFactor` per element). `viewRef:
ViewState` shared with parent for coordinate conversion on drops. Canvas clamp prevents elements
exiting room bounds. All element interaction is handled via pointer-events-tracking on the stage
(not per-node), using ref-mutable state for drag operations.

### Furniture Unification (Phase 2.8, built 2026-07-31)

A table used to exist **three times over**, which is what made the planner feel
"detailed but broken":

| Old model | Held | Used by |
|---|---|---|
| `InventoryItem` (TABLES) | stock count, photos, purchase data | inventory page |
| `TableProfile` | dimensions, chairs, numbers, BOM | setup layer, bookings, auto-seat |
| `FloorPlanElement` type `TABLE` | its own x/y/w/d/chairs | base plan only |

The first two were joined **only by matching name strings**
(`profiles.find(p => p.name === item.name)`), so renaming either side silently
detached stock from geometry. Worse, the setup layer had **no way to add a
table at all**: the canvas drop handler expected a `tp_<id>` drag payload that
nothing in the app emitted any more, so no tables → no groups → no bookings →
nothing for auto-seat to seat.

**Now: one record.** A piece of furniture is an `InventoryItem` with geometry
fields set — name, photo, qty owned, footprint, shape, chair rules, table
numbers and BOM all on one row.

- New `InventoryItem` fields: `elementVertices` (polygon outline), `seatingDensity`,
  `maxHeadChairs`, `tableNumbers`, `chairItemId` (which chair type seats it).
  `elementShape` now accepts `POLYGON`.
- `FurnitureBomItem` — self-referential BOM on `InventoryItem`, replaces `TableProfileItem`.
- `SetupItem.furnitureItemId` replaces `tableProfileId` (kept nullable for migration);
  `SetupItem.chairs` (Json `ChairSlot[]`) replaces `chairEdges`.
- `FloorPlanSetup.isDefault` — see "Default layout" below.

> **`TableProfile` is deprecated but still declared in `schema.prisma`.**
> `docker-entrypoint.sh` runs `prisma db push --accept-data-loss` **before** any
> migration script, so removing the models here would drop the tables before
> `migrate-furniture.ts` could read them. Delete both models only once every
> deployment has run the migration at least once.

**Migration:** `packages/db/prisma/migrate-furniture.ts`
(`npm run db:migrate-furniture`), wired into `docker-entrypoint.sh` **after**
`db push`. Idempotent — each phase re-checks its own state,
so a half-finished run resumes on the next boot. Six phases: profiles →
inventory, placements rewired, one default layout per plan guaranteed,
base-plan tables lifted into the default layout (grouped by footprint so twelve
identical tables become one furniture type with `totalQty` 12, elements
soft-deleted), table numbering, default chair types seeded.

**Default layout.** Every floor plan has exactly one `FloorPlanSetup` with
`isDefault: true` — the venue's everyday arrangement. It is created on demand
(`ensureDefaultSetup`), **cannot be deleted** (409 from the DELETE route), and
**owns the real table numbers**: table 12 is a physical spot in the room. Event
layouts are additional named setups that inherit the numbering and can override
per table; the venue reverts to the default when no event is active. Promoting
another layout to default demotes the incumbent in the same transaction.

**Geometry + chairs — `lib/furniture.ts` (pure, 72 tests).** Rectangles,
circles and freeform polygons all reduce to one closed ring wound so the
outward normal of every edge is `(-uy, ux)`, so chairs, snapping and area
totals have exactly one case to handle.

- `logicalEdges()` merges raw segments into the sides a person would recognise
  (turn angle < 30°). This is load-bearing: a circle is polygonised into 48
  ~7cm segments that would each be rejected as "too short to seat", but they
  bend gently so they merge into one 314cm side and seat evenly around the
  curve. A rectangle's 90° corners exceed the tolerance, so it keeps its four
  sides and its head-edge capping. Head caps are applied only to four-sided
  outlines — applying them to a curve or an L-booth would strip out most seats.
- **Chairs are stored as `t` in [0,1) around the outline**, not as per-edge
  counts. That is what lets a chair be dragged anywhere on any shape, and
  rotating the table carries its chairs for free. `projectToPerimeter` turns a
  drag into a new `t`; `chairTFromWorld` is its world-space inverse.
- `validatePolygon` rejects self-crossing outlines — a crossed shape makes
  chair distribution and area totals nonsense.

**UI.** `FurnitureForm` + `FurnitureShapeEditor` (in Inventory → TABLES) replace
`TableProfileForm`, whose chair-edge designer was **never included in the save
body** — every edit to it was silently discarded. The shape editor draws
freeform outlines (click to place points, drag to adjust, grid-snapped) with a
live chair/area/perimeter readout. `FurniturePalette` is the visual picker in
the planner's right panel: each tile draws the piece's real outline and seats,
with `available/total` badges; drag onto the canvas or click to arm and click to
place. `/admin/table-profiles` and `/api/admin/table-profiles` are **removed**.

**Watch out:** anything grouping placements by furniture must use
`setupItemFurnitureKey()` (or `resolvePlacedFurniture()` server-side) and gate on
a non-null key. Comparing `tableProfileId` directly is a trap — after migration
every row has `null`, so `null === null` makes every table on the plan match
every other one (this bug reached the snap/auto-join path and is now covered by
`lib/furniture-key.test.ts`).

| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/furniture` | GET, POST | List (`?type=CHAIR` filters) / create furniture |
| `/api/admin/furniture/[id]` | GET, PUT, DELETE | CRUD; DELETE 409s while still placed |

### Inventory-Aware Spatial Planning Engine (Phase 3+, built 2026-07)

The floor planner has been upgraded from a basic drawing tool into a layered, inventory-aware
spatial planning engine suitable for large event centers. The canvas uses three distinct
`PIXI.Container` layers controlled by `FloorPlanPixiCanvas`:

- **baseLayer** — static walls, fixtures, zones (locked / non-interactive in setup mode)
- **sectionBoundaryLayer** — translucent section boundary polygons with colour fills and name watermarks
- **setupLayer** — interactive tables/furniture (draggable, selectable, snappable)

**Layered Floor Plans:** A `FloorPlanBase` (the existing `FloorPlan` model with permanent walls
and fixtures) can have many `FloorPlanSetups` — named furniture layouts for specific events
(e.g. "WEDDING RECEPTION", "CONFERENCE"). Each `SetupItem` records X/Y coordinates and
references an `InventoryItem` via `furnitureItemId` (see "Furniture Unification"). Setups are
saved independently via `PUT /api/admin/floorplan/[id]/setups/[setupId]/items`.

> The old `TableProfile` + `TableProfileItem` BOM models described below were **replaced by
> inventory-backed furniture** in 2026-07-31 — the models are deprecated (kept only for
> migration) and nothing in the app writes them. Read "Furniture Unification" above for the
> current data model; `chairEdges`/per-edge chairs were likewise replaced by `SetupItem.chairs`.

**Setup Editor:** `FloorPlanEditor.tsx` has been extended with a setup toolbar (switcher
dropdown, +NEW, DELETE, GROUP/UNGROUP buttons). When a setup is active, placing tables
from the Furniture palette is done via the canvas — existing tables are created through the
inventory module (`/admin/ops?tab=inventory` → TABLES category), added to plans as `SetupItem`
records. Available/pool
counts are shown as badges (`3/5`). Canvas rubber-band selection works for setup items.

**Room setups (photo-backed, built 2026-11).** A room setup is a `FloorPlanSetup`
with presentation metadata — `roomName`, `areaId`, `guestCapacity`, `setupStyle`
and `imageUrls String[]` — while the setup geometry stays the single table plan.
`lib/room-setup.ts` (pure) renders the label (`[ROOM] - 22PAX SIT DOWN`, falling
back to the setup name), normalises the editor payload and sanitises photo URLs.
The admin editor's `+ NEW SETUP` / `EDIT SETUP` open the shared
`RoomSetupModal` (name, room, pax, style, notes, photos via `MultiImagePicker`)
instead of the old `window.prompt`; the setup bar shows the label and thumbnails.
**Events → ROOMS & PLANS** (`RoomsPanel` / `RoomSetupsPanel`) is the canonical
home: TABLE PLANS embeds `FloorPlansClient`, ROOMS edits Areas + calendar feeds,
and ROOM SETUPS is a venue-wide list (`GET /api/admin/floorplan-setups`) that
links each setup to a room via `FloorPlanSetup.areaId` and edits presentation
fields. `/admin/floorplan` and `/admin/settings?tab=floorplans` redirect there.
Events carry `setupId` as before; the event header and the BEO `ROOM_SETUP` block
render a `RoomSetupCard` (label, pax/style, photos, and a read-only
`SetupPlanThumbnail` SVG of the linked layout). Customer share pages stay
unchanged — room photos are internal and are **not** added to the share view.
Managers (ADMIN/MANAGER) can also edit a room setup from the worker floor plan:
`WorkerFloorPlan` shows the photos to all staff and an `EDIT SETUP` button for
managers, saving through `PUT /api/worker/floorplan/setups/[id]` (venue-checked,
presentation fields only; floor staff get 403). The worker session GET returns
`role` so the UI can hide the write affordance.

**Magnetic Edge Snapping + auto-join:** When a `SetupItem` is dragged close to another
same-furniture item, the canvas detects edge proximity (parallelism, distance, facing, overlap)
and snaps the item flush against the target edge (`snapThreshold`, default 15cm; fires on
`pointerup`). A flush snap also **auto-joins** the two into a `TableGroup` — new joins use a
client-side temp group id (`new_group_*`) that `handleSave` materialises into a real
`TableGroup` row once items have DB ids. Grouped tables then **move as a unit**.

**Section detection + live totals:** On drop/drag-end a table auto-tags to the section **zone**
(the coloured rectangles drawn in SECTIONS mode) its centre lands in — this replaced the
`SectionBoundary` path in the editor (the model/API remain but nothing in the editor creates
boundaries). `computeSetupSectionTotals(setupItems, zones, profiles)` in
`lib/floorplan-inventory.ts` then tallies tables + effective seats per zone (grouped tables
counted as a unit via `computeEffectiveChairs`); the canvas draws a live `N TBL · M PAX` badge
on each zone and the setup toolbar shows the grand total. `pointInPolygon` (ray-casting) still
backs the geometry.

**Inventory Calculation Engine:** `calculateSetupInventory(setupItems, profiles, inventory)` in
`lib/floorplan-inventory.ts` is a pure function that tallies BOM items across all placed tables,
compares against total venue inventory, and returns sorted shortages. For grouped tables, it
computes the union polygon via `polygon-clipping`, calculates exposed perimeter, and determines
max chairs from perimeter / `seatingDensity` (with `maxHeadChairs` capping). The
`SetupInventoryPanel` component renders shortages in the right panel on demand.

**Banquet Joinery:** `SetupItem`s can be grouped via `TableGroup`. Grouping is validated at the
API layer — all items must share the same furniture key (`setupItemFurnitureKey()`, see
"Furniture Unification"). Grouped tables get gold dashed
outlines on the canvas. `computeGroupChairs` uses `polygon-clipping` to union table polygons,
then `distributeChairsAlongPerimeter` places chair indicators evenly along the exposed perimeter
with outward-facing normals.

**Head-of-Table Constraint:** On rectangular tables, edges parallel to the short dimension are
identified as "head edges". Chair count on head edges is capped at `maxHeadChairs × headMultiplier`
(where `headMultiplier` = round(edgeLen / min(width, depth))). This prevents cramming chairs
on the narrow ends of banquet tables.

**API routes for the new models:**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/floorplan/[id]/setups` | GET, POST | List/create setups |
| `/api/admin/floorplan/[id]/setups/[setupId]` | GET, PUT, DELETE | Setup CRUD |
| `/api/admin/floorplan/[id]/setups/[setupId]/items` | PUT | Bulk save setup items |
| `/api/admin/floorplan/[id]/setups/[setupId]/groups` | GET, POST | List/create groups |
| `/api/admin/floorplan/[id]/setups/[setupId]/groups/[groupId]` | GET, PUT, DELETE | Group CRUD |
| `/api/admin/floorplan/[id]/section-boundaries` | GET, PUT | Section boundary CRUD |
| `/api/admin/floorplan-setups` | GET | Cross-plan setup list (default layouts etc.) |
| `/api/worker/floorplan/setups` | GET | Worker setup list (venue-checked, includes room metadata/photos) |
| `/api/worker/floorplan/setups/[id]` | GET, PUT | Worker setup detail; PUT is manager-only room-setup metadata/photos |

> **Removed:** `/api/admin/table-profiles*` and the `/admin/table-profiles` page
> are gone — furniture lives on `InventoryItem` (see "Furniture Unification").

**Worker View:** `WorkerFloorPlan` has been extended with a setup switcher dropdown (alongside
the existing view switcher). Workers can switch between the base plan and any setup. Setup
items render on the read-only canvas with auto-assigned numbers as labels. A setup banner
shows the active setup name. The active room setup also renders its label, pax/style, notes
and photos for every staff member; managers additionally get `EDIT SETUP` (see "Room setups").

**Interactive overhaul (2026-07):** the setup layer became the single interactive table layer
and the loop was closed end-to-end:
- **Direct-manipulation editing** — select a `SetupItem` to delete (Delete key / panel), rotate
  (on-canvas drag handle + preset buttons), and set chairs by **clicking table edges** (left =
  add, right = remove) up to capacity/head caps. (The per-edge `chairEdges` implementation is
  deprecated — chairs now live as `SetupItem.chairs` `ChairSlot[]` from `lib/furniture.ts`; the
  pure `adjustEdgeChairs` / `defaultEdgeChairs` / `maxChairsForEdge` logic in
  `lib/floorplan-chairs.ts` remains for legacy rows.)
- **Auto-join on proximity** (see Magnetic Edge Snapping above) with grouped-move.
- **Merged-group rendering** — grouped tables draw one union outline (`unionTablePolygons`) with
  chairs redistributed evenly (`computeGroupChairs`) instead of N separate rectangles.
- **Live per-area totals** and **section auto-tagging via zones** (see Section detection above).
- **Two-layer UX** — while a setup is active the base plan dims + locks (`baseLayer.eventMode
  = 'none'`) and base-only tools (SECTIONS) hide; a "BASE PLAN LOCKED" note shows.
- **Fixes** — undo/redo now snapshots `{ elements, setupItems, zones }`; stale room-dimension
  closure in the Pixi init effect fixed; the dead Konva `FloorPlanElementVisual` renderer removed.

**WALLS drawing mode:** Toolbar WALLS toggle activates a click-to-place wall mode. Each click
places a wall anchor point; points connect as thick grey rectangles with a configurable
thickness (default 15cm). The wall direction is determined by the line between two consecutive
points — walls auto-orient horizontally or vertically. SAVE WALLS finalises the polyline.
Wall elements are stored as `RECTANGLE` shapes with the specified thickness
and render as solid grey blocks.

**Polygon section zones:** SECTIONS mode supports two drawing methods — rectangle drag (existing)
and freeform polygon. POLYGON toggle in the toolbar switches to click-to-place polygon
vertices; click the canvas to add points, then click SAVE in the right panel. Polygons use
`pointInPolygon` (ray-casting) for
element section detection, same as rectangular zones. The inspector shows vertex count + area.
Both rectangle and polygon zones render with section colour fill, watermarked name, and 8
resize handles (rectangles) or vertex edit handles (polygons).

**Door swing arcs + sliding arrows:** DOOR elements render with a 90° swing arc (dashed
quarter-circle) showing the door's open path, anchored to the hinge side. Sliding doors draw
parallel arrows along the wall direction indicating slide path. The swing direction is stored
in `style.swingDirection` (`LEFT` / `RIGHT`) and toggled from the inspector. Door width sets
the arc radius.

**20-colour palette:** Section zones use a fixed palette of 20 visually distinct colours
with 0.06 fill / 0.5 border opacity. Colours auto-assign when creating a new zone, cycling
through the palette. The `SectionZonesList` sidebar shows each zone's assigned colour swatch.
Zones are grouped by department in the sidebar; the group header colour matches the department
badge. Zone colours are stored per-zone and surfaced on the calendar event modal + worker
floor plan view for consistent visual mapping.

**Section overlap validation:** On zone draw-end and resize-end, the canvas checks the new
zone's bounding box against all other zones on the plan. If the overlap exceeds 5% of the
smaller zone's area, the zone snaps back to its previous position and a toast warns
"SECTIONS CANNOT OVERLAP." Pure geometry check via polygon intersection — no API round-trip.

**Vitest Coverage:** the floor planner area has ~200 tests across its libs and
components. `lib/furniture.test.ts` has 66 tests covering the unified
outline/chair engine (see "Furniture Unification").
`lib/floorplan-inventory.test.ts` has 49 tests covering
`calculateSetupInventory`, geometry helpers, `computeGroupChairs`,
`computeEffectiveChairs`, `computeSetupSectionTotals`, `pointInPolygon`, and BOM
integration. `lib/floorplan-chairs.test.ts` (11) covers the deprecated per-edge
chair logic and `lib/auto-seat.test.ts` (7) covers the bin-packing planner.
`FurniturePalette.test.tsx` (13), `FurnitureShapeEditor.test.tsx` (13) and
`SetupInventoryPanel.test.tsx` (7) cover the furniture UI.

### Inventory + stocktake + Pantry Bible (Phase 2+, extended 2026-08/10)
Full inventory management system: `InventoryCategory` (**20** built-in: 6 FOOD,
6 BEVERAGE, 8 OTHER incl. FURNITURE/TABLES + per-venue custom) and
`InventoryItem` (venue-id-scoped, one row for stock + furniture + equipment).
`ElementInventoryItem` junction links items to floor plan elements with
quantity. `StocktakeRecord` + `StocktakeLineItem` for periodic stock counts.

**Admin pages:** `/admin/ops?tab=inventory` (the `/admin/inventory` stub
redirects) — `OpsClient` renders **INVENTORY · RECIPES · MENU ITEMS · PANTRY BIBLE · STOCKTAKE**
sub-tabs (`lib/hub-tabs.ts`). `InventoryClient` is a master-detail layout — left column
(vertical CATEGORIES nav + INVENTORY SUMMARY tree), right column (item list with
real AVAIL column + compact PROPERTIES form). Dynamic headers
(`FURNITURE STOCK`/`STANDARD STOCK`) and buttons (`+ ADD TABLE`/`+ ADD ITEM`)
based on the selected category. Items can be edited (PUT) and duplicated, and
**SHOW DELETED** reveals RESTORE (`POST .../restore`) + PURGE
(`DELETE ?permanent=1`).

**Stock-aware tracking:** `InventoryItem.totalQty` is the physical count of items
owned. `GET /api/admin/inventory` returns `placedCount` (from
`_count.elements`) so the UI computes `availableQty = totalQty - placedCount`.

**Delete protection (#117).** `DELETE /api/admin/inventory/[id]` refuses to
soft-delete or permanently purge an item that a live record still references. It
returns **409** `{ error: 'IN USE', blockers: [{ kind, count, label, href }] }`
instead of deleting; `label` is plain English ("Used in 2 recipes") and `href`
is the admin page that owns the link. No override exists — the user removes the
link and retries, or cancels. Blockers are counted by
`lib/inventory-usage.server.ts` `findInventoryBlockers()` for: floor plan
elements and setup placements (`ElementInventoryItem`, `SetupItem`), stocktakes
(`StocktakeLineItem`), recipes (`RecipeLineItem`), task item links
(`Task.linkedItemId`), product equipment links (`MenuItemInventoryItem`), POS
serves (`MenuItemServe`), product option drawdowns (`MenuItemOptionChoice`),
menu stock lines (`MenuMenuItem`), supplier codes and
aliases (`SupplierItemCode`, `SupplierItemAlias`), purchasing history
(`PurchaseOrderLine`, `SupplierInvoiceLine`, `SupplierPriceMovement`), deliveries
(`DeliveryItem`) and furniture BOM children (`FurnitureBomItem`). Soft-deleted
parents are ignored (a deleted stocktake/recipe/task is not "in use"); the
owner's own child rows (storage locations, maintenance logs, a furniture item's
own BOM) do not block. **A permanent purge (`?permanent=1`) calls the helper
with `{ includeDeletedParents: true }`**, which counts every physical row — a
soft-deleted supplier code/alias/price movement/delivery or stocktake line still
carries a required FK, so ignoring it would let `inventoryItem.delete()` throw
P2003. `DELETE /api/admin/furniture/[id]` uses the same helper (setup
placements are the furniture-specific case) and returns the same 409 shape. The
pure formatting/sorting helpers live in `lib/inventory-usage.ts`; the inventory
UI shows the blockers in a modal (`ITEM IS STILL IN USE`) with an `OPEN →` link
per row. Legacy `TableProfileItem`/`StepInventoryItem` rows are cascade-only and
not treated as live usage.

**Recipes vs Menu Items (built 2026-11).** They are separate authoring surfaces
under Inventory & Stocktake. **RECIPES** (`RecipesClient`) is the prep/BOM
editor only: ingredients, PANTRY BIBLE references, sub-recipes, yield,
instructions. **MENU ITEMS** (`MenuItemsClient`) is the sold product: optional
recipe attach (`recipeId` nullable), price, descriptions/image, allergens,
SWIFT POS code via PRODUCT INFO, ITEM LINKS (serves/drawdown) and EQUIPMENT.
`POST/PUT /api/admin/recipes` no longer create or update `MenuItem` rows;
`POST /api/admin/menu-items` accepts `recipeId: null`. Old
`/admin/recipes` and `/admin/menu-items` links redirect into the inventory tabs.

**Worker page:** `/w/stocktake` — scrollable count list, submit IN_PROGRESS or
COMPLETED. Dashboard stocktake card with pending count.

**Furniture in inventory:** furniture IS an inventory item — one record holding
stock, footprint, shape, chair rules, table numbers and BOM (see "Furniture
Unification"). Creating/editing opens `FurnitureForm` in a modal from the TABLES
category. `TableProfile`, `TableProfileForm` and `/admin/table-profiles` are gone.

**Photo paste-to-upload:** `imageUrls` (JSON array of URLs, not a single
`imageUrl`) — the equipment form renders a gallery with paste-to-upload support
(paste an image → uploads to `/api/admin/upload` → appends URL). Photos can be
reordered and deleted individually. `storageSectionId` is written as a mirror of
the **first** `ItemStorageLocation` row for legacy readers; the junction is the
read path.

**Equipment & tool tracking:** `InventoryItem` carries `storageLocations
ItemStorageLocation[]` (`sectionId`, `qty?`, `notes`, unique per item+section),
`serialNumber`, `purchaseDate`, `warrantyExpiry`, `serviceIntervalDays`,
`lastServicedAt`, `nextServiceAt` (auto-computed), `maintenanceNotes`, and
`supplierId`. `MaintenanceLog` rows (`note`, `staffId`, `createdAt`) show as a
chronological log. Equipment fields are shown per category by
`InventoryCategory.showDeepFields` / `showEquipmentFields` (FOOD/BEVERAGE show
deep fields; OTHER/TABLES show equipment tracking).

**Deep inventory:** FOOD/BEVERAGE items use `shelfLifeDays`, `canFreeze`,
`freezerShelfLifeDays` (no single expiry-date input any more — the legacy
`expiryDate` column survives and `runExpiryScan` still sweeps it, but auto-expiry
only works on legacy data). `storageType StorageType` (`AMBIENT | CHILLED |
FROZEN`) drives delivery temperature checks. Density fields
(`densityGramsPerMl`, `weightPerUnitGrams`) bridge VOLUME/MASS/COUNT so mixed
recipe lines can sum in grams. Fallback category has been removed — deleted
categories automatically unassign items.

**Units of measure — `lib/unit-convert.ts` (37 tests, pure).** `UnitOfMeasure`
rows carry `kind: UomKind` (`VOLUME`→mL / `MASS`→g / `COUNT`→ea),
`conversionRatio` and a nullable `venueId` (built-ins are global). All conversion
routes **through grams**; metric cup = 250 mL. `canonicalQty` gives the recipe
explosion a gram sum whenever an item has a density/unit-weight bridge, else the
legacy base unit. `GET /api/admin/uoms` auto-seeds 17 built-ins (incl. CUP/TBSP/
TSP/PINT/OUNCE/POUND); built-ins are read-only. Deep items also have
`countingUnitId`/`countingUnitQty`, `orderingUnitId`/`orderingUnitQty`, and
`parLevelUnitId`. `lib/reference-table.ts`/`recipe-line-kinds.server.ts` reject
incompatible UOM kinds at author time (a VOLUME serve on a COUNT item).

**Pantry Bible — `IngredientReference`.** The known-ingredient density library:
`name` (UPPERCASE) + `densityGramsPerMl?` / `weightPerUnitGrams?` + `notes`
("1 CUP ≈ 132G"). Global built-ins + venue rows, `@@unique([venueId, name])`,
built-ins undeletable. The `/admin/ops?tab=inventory&sub=pantry`
(`PantryBibleClient`) tab lists them; creation happens from an inventory item's
density box (SAVE AS KNOWN INGREDIENT or the FIND THE DENSITY LLM copy/paste
modal — `lib/llm-prompt.ts`, 8 tests; no backend LLM call). Recipe lines can pick
a Pantry Bible entry (`RecipeLineItem.ingredientReferenceId`) — **Pantry entries
are knowledge, not stock**: `explodeRecipe` skips them, they never hit stocktake
or deduction. `/api/admin/ingredient-references` GET/POST/DELETE (no PUT).

**Allergen management:** 24 allergens (Almond, Barley, Brazil Nut, Cashew, Crustacean,
Egg, Fish, Gluten, Hazelnut, Lupin, Macadamia, Milk, Mollusc, Oats, Peanut, Pecan, Pine nut,
Pistachio, Rye, Sesame, Soy, Sulphites, Walnut, Wheat) managed via `AllergenPicker`
component with grouped buttons (DAIRY, NUTS, GRAINS, etc.). Allergens are stored as
comma-separated `dietaryInfo` on `MenuItem` and edited in the **MENU ITEMS** editor
(Recipes are prep-only and do not carry allergens). Recipe-derived allergens are
computed from the linked recipe's line items where shown; `AllergenPicker` accepts
an `inherited` list so derived allergens render as locked.

**Alternative suppliers:** `InventoryItem.alternativeSupplierIds Json` holds an
ordered array of backup supplier UUIDs. `SupplierItemCode` links each supplier to
an item with `supplierSku` — **model + backup/restore only; no API/UI uses the
SKU yet** (orphaned). The inventory form shows linked suppliers and supports
reordering.

**Food Health & Safety (compliance hub, built 2026-08).** `/admin/compliance`
(`ComplianceClient`) has four tabs (`COMPLIANCE_TABS`) — **TASKS · DELIVERIES ·
ALERTS · LOGGERS** (LOGGERS is a sensor-fleet placeholder; `/api/sensors/*` does
not exist yet). This is NZ GFMP/Chomp-style food safety, **not HR compliance**.

- **READING tasks** — `Task.completionType: READING` + `hsCategory`
  (`FOOD|EQUIPMENT|TEAM|FACILITY`), `readingUnit`, `readingMin/Max`,
  `criticalMin/Max` + `linkedItemId`. The worker `/w/tasks` list renders a big
  numeric input with live PASS/FAIL; the completion stores denormalised `value` +
  `valueStatus ReadingVerdict` (so later threshold edits don't rewrite history).
  A FAIL raises an `HsAlert`; CRITICAL also posts an URGENT pinned Notice.
- **Deliveries** — `Delivery` (supplier snapshot, `deliveredAt`, `receivedById`,
  `vehicleTemp`, `vehicleVerdict`, invoice ref) + `DeliveryItem` (item snapshot,
  qty/unit/temp, `verdict`, `disposition ACCEPTED|REJECTED`). Verdicts are
  computed **server-side** on write (`lib/food-safety.ts`, 37 tests), FAIL lines
  raise `DELIVERY_TEMP` alerts. Worker flow at `/w/deliveries` (direct URL only —
  no dashboard/hamburger tile yet). Routes: `/api/admin/deliveries(+/[id])`,
  `/api/worker/deliveries`.
- **Alerts** — `HsAlert` (`severity WARNING|CRITICAL`, `kind OUT_OF_RANGE |
  DELIVERY_TEMP | MAINTENANCE_DUE* | SENSOR_OFFLINE*`, status OPEN/RESOLVED,
  optional `taskId`/`deliveryItemId`). `/api/admin/hs-alerts(+/[id])` lists,
  raises manually, resolves with a note, soft-deletes. `/api/admin/compliance/summary`
  powers the TASKS tab health widget.

**EOD reconciliation:** `POST /api/admin/inventory/reconcile` tallies exploded
ingredients from completed orders (`grams-aware` labels) against stock. Deferred
inventory deduction is still not built.

**Stock hierarchy:** `GET /api/admin/stock/hierarchy` returns a Section → Table →
Inventory Items tree in one query. `GET /api/admin/structure` extends with
`floorPlan { tables, chairs, equip }` per section.

### Purchasing (purchase orders, supplier invoices, 3-way match, price movements)

Phase 1 of #105. **New, additive models:** `PurchaseOrder` (+ `PurchaseOrderLine`
with `receivedQty`), `SupplierInvoice` (+ `SupplierInvoiceLine` with
`matchStatus UNMATCHED | MATCHED | VARIANCE` and optional PO/receipt links),
`SupplierItemAlias` (normalised line text → item — the learned recognition
memory), `SupplierInvoiceTemplate` (versioned `config Json`,
`status DRAFT | ACTIVE`, `sampleFingerprint`) and `SupplierPriceMovement`
(old/new/delta/percent, `acknowledgedAt`). `Delivery` / `DeliveryItem` gained
optional `purchaseOrderId` / `purchaseOrderLineId` / `invoiceId`, so a goods
receipt is the existing H&S record, linked. `SupplierItemCode` is now live
(SKU → inventory item + purchase price). Tables are additive (`db push`).

**Pure libs** (Prisma-free, Vitest): `lib/purchasing.ts` (PO totals incl. 15%
GST, status transitions, partial-receipt maths), `lib/invoice-import.ts`
(deterministic anchor/column/date parser + template validation + LEARN prompt),
`lib/invoice-match.ts` (SKU → alias → fuzzy → NEW, plus qty/price variance),
`lib/supplier-template.ts` (config normalise/version/fingerprint),
`lib/price-movements.ts` (delta/percent/severity) and `lib/purchasing-api.ts`
(venue resolution, money helpers). `lib/pdf-text.server.ts` extracts PDF text
server-side (`pdfjs-dist`); scanned PDFs are out of scope.

**Flow.** Create PO → SEND (DRAFT only) → RECEIVE (full or partial). A receipt
creates the `Delivery` / `DeliveryItem` rows, applies each received price to
`InventoryItem.costPrice` / `SupplierItemCode.purchasePrice`, and writes a
`SupplierPriceMovement` for every change (an alert is raised on any change —
default is any change). Invoices never change prices; they only flag variance.

**Invoice import is fully offline.** Pick a supplier + an ACTIVE template, feed
a digital PDF (text extracted server-side) or pasted text → **preview** (header,
lines, per-line item match, issues) → **commit**. Matching runs
`SupplierItemCode.supplierSku` → `SupplierItemAlias` →
`lib/import/similarity` fuzzy → NEW. An unmatched line is never dropped: it
stays in the payload with `inventoryItemId: null` and commits as `UNMATCHED`.
Commit upserts confirmed `SupplierItemCode` / `SupplierItemAlias` rows (so repeat
imports need no manual matching), links PO lines, and sets the invoice status
MATCHED / VARIANCE / PENDING_MATCH. A duplicate supplier invoice number is 409.

**Template learning is copy-paste, never at import time.** `LEARN TEMPLATE`
posts a sample to `/supplier-templates/learn-prompt`, which returns a markdown
prompt to paste into an external LLM; the JSON it returns is validated and saved
as a new version. Import time never calls an LLM and needs no network.

**UI.** Ops → Inventory → **PURCHASING** (`PurchaseOrdersClient`) and
**INVOICES** (`SupplierInvoicesClient`); both tabs render `PriceMovementsPanel`.
Settings → **SUPPLIERS** gains `SupplierPurchasingPanel` (SKUs, aliases,
templates) under the selected supplier.

**Routes** (guards `ops.purchasing.view | create | edit | delete | approve`;
MANAGER venue-locked, ADMIN across accessible venues):
`/api/admin/purchase-orders` (+ `/[id]`, `/[id]/send`, `/[id]/receive`),
`/api/admin/supplier-invoices` (+ `/[id]`, `/import`, `/import/commit`),
`/api/admin/supplier-templates` (+ `/[id]`, `/[id]/test`, `/learn-prompt`),
`/api/admin/supplier-item-codes` (+ `/[id]`),
`/api/admin/supplier-aliases` (+ `/[id]`) and
`/api/admin/price-movements` (+ `/[id]`).

**Tests:** `lib/purchasing.test.ts`, `invoice-import.test.ts`,
`invoice-match.test.ts`, `supplier-template.test.ts`, `price-movements.test.ts`,
`pdf-text.test.ts`, route tests (`purchase-orders/[id]/receive`,
`supplier-invoices/import/commit`) and component tests
`InvoiceImportModal.test.tsx` / `PurchaseOrdersClient.test.tsx`.

**Deferred:** OCR / scanned PDFs, accounting ledger / payment runs, spend
reports and price-history reporting (Phase 2), and automatic stock deduction
(not built anywhere).

### SwiftPOS integration (sales + staff sync + menu links + dockets, 2026-10)
`Venue.swiftPosBaseUrl` + `MenuItem.swiftPosId` (SwiftPOS `Inventory_Code`).
For a local Docker stack, point the venue at the host-published SwiftDOSnet
port via `http://host.docker.internal:<port>` — `localhost` inside the app
container is the container itself, not the host. Live smoke-tested 2026-10-29
against the local TESTURANT venue (staff sync, menu links, kitchen dockets,
PIN-on-link).
`lib/swiftpos.ts` (5 tests) parses a SwiftDOSnet sales report and matches rows to
products by `swiftPosId`; `lib/swiftpos.server.ts` fetches
`/api/analytics/sales?groupBy=product`, `/api/lookups` (locations/terminals/
clerks/medias/print groups), `/api/products` (paged product master) and
`/api/table-tracking/kitchen-dockets`. `lib/swiftpos-consumption.server.ts`
turns sales into drawdown — MADE serves go through `explodeRecipe`,
pour/bottle via `canonicalQty` — and reports variance vs on-hand for BASE items.
**Read-only report; nothing mutates stock** (auto-deduct not built). Admin UI at
Settings → SWIFT POS (`SwiftPosSalesClient`, **SALES / STAFF SYNC / MENU LINKS**
sub-tabs); route `GET /api/admin/swiftpos/sales[?drawdown=1]` (guard
`ops.inventory.view`).

**Staff sync** (`2026-10-22`) pulls SwiftPOS clerks from SwiftDOSnet
`GET /api/lookups` and links them to venue staff via `Staff.swiftPosId`.
`lib/swiftpos-staff.ts` (23 tests, pure) parses the clerk list, splits
`"Jane Doe"` / `"Doe, Jane"` names, suggests a match only when exactly one
unlinked staff member has the same name tokens, and exposes the route's
decision helpers (`clerkCodeConflict`, `resolveCreatedName`, `resolveClerkPin`,
`findPinClash` — the last takes the bcrypt comparator so the lib stays
client-safe). Settings → SWIFT POS → STAFF SYNC (`SwiftPosStaffSync`) shows
LINKED / SUGGESTED / NEW rows and offers LINK, UNLINK and CREATE. CREATE makes a
`STAFF` profile with the clerk number as the 1–4 digit worker PIN (bcrypt-hashed;
the clerk number, or an override) and blocks a PIN already in use at the venue.
LINK also sets the PIN from the clerk id (or the typed override) when the staff
member has **no** PIN; an existing PIN is never overwritten — the response says
`PIN ALREADY SET FROM CLERK ID` or `EXISTING PIN KEPT`, and a PIN clash links
without changing it.
Routes: `GET /api/admin/swiftpos/staff?venueId=` (guard `team.staff.view`),
`POST /api/admin/swiftpos/staff` (LINK/UNLINK `team.staff.edit`,
CREATE `team.staff.create`). SwiftDOSnet has no auth; it is reached server-side
from HOSPO OPS, never the browser. Staff records still carry `Staff.swiftPosId`
for future roster/task sync (not built).

**Menu-item linking** (`2026-10-27`) maps each SwiftPOS product to the local
product that carries its code. `lib/swiftpos-products.ts` (pure) parses the
paged `GET /api/products` envelope (`{ rows, hasMore, total }`, camel/Pascal,
short-flags), and `buildProductLinks` classifies rows as linked/unlinked while
surfacing **orphans** (local codes missing from the POS master) and
**duplicates** (one code on multiple local products — `MenuItem.swiftPosId` has
no unique index and `matchSalesToItems` would silently pick one). The server
helper `fetchProducts(baseUrl)` loops pages of 100 up to a 2,000-row cap and
returns `truncated`. Settings → SWIFT POS → MENU LINKS (`SwiftPosMenuLinks`)
groups products by SwiftPOS category with search, a category filter, counts,
LINK/UNLINK and expand/collapse; a product's SWIFT POS CODE is also editable
from PRODUCT INFO on a menu line (`MenuItemDetailsModal`). Routes:
`GET /api/admin/swiftpos/menu-links?venueId=` (guard `ops.menus.view`; 400 when
not connected, 502 on fetch failure) and `PUT` (guard `ops.menus.edit`; writes
`MenuItem.swiftPosId` only — **never** pushes to Woo, and 409s when another
local product already holds the code).

**Kitchen dockets** (`2026-10-27`) is the live pass view. `lib/swiftpos-dockets.ts`
(pure) parses the bare `GET /api/table-tracking/kitchen-dockets` array
(`transactionId/tableNumber/booking/covers/clerk/terminal/opened/lines`; line
`quantity/seat/printGroup/instruction/...`) and `docketWindow(nowMs, tz,
minutes)` builds **unzoned venue-local** `YYYY-MM-DD HH:mm` strings (the feed's
timestamps are unzoned wall-clock, so they are never `new Date()`-parsed).
`KitchenDocketsClient` lives at `/admin/ops?tab=orders&sub=dockets` (`DOCKETS`
tab in `OPS_SUB_TABS.orders`, no sidebar entry), polls every 30 s while visible,
pauses when the tab is hidden, and offers 30 / 60 / 120 min / ALL LINES windows.
Route: `GET /api/admin/swiftpos/dockets?venueId=&minutes=` (guard
`orders.orders.view`; default 60; 400 when not connected, 502 with the
SwiftDOSnet problem `detail`/`title`).


### Guest parking (Scan2Pay) — optional, OFF by default (built 2026-11)

Registers a guest's number plate with the Scan2Pay carpark so they get the
**free 90-minute** window instead of the 15-minute grace. The integration is
**disabled and invisible by default** so a FOSS install cannot accidentally use
it: nothing is shown to workers and no outbound traffic is sent until an admin
saves a `scan2pay.nz` carpark URL and enables it in **Settings → FTP →
90 MINUTE CAR PARK**.

- **Config** — `ParkingConfig` (one per venue, `@@unique([venueId])`):
  `enabled`, `entryUrl` (the `…/Parking/Scan?carparkId=…` URL — the only input),
  derived `carparkId`/`carparkName`, `durationMinutes` (default 90),
  `healthCheckMode READINESS|FULL|OFF`, `healthPlate` (default `STELLA`) and the
  cached `lastCheckAt/lastCheckOk/lastCheckMessage`. Only `scan2pay.nz` URLs are
  accepted; the carpark name is read from the Scan page on save.
- **Registration** — `ParkingRegistration` is the audit row per attempt
  (`status CONFIRMED | FAILED | ALREADY_ACTIVE`, window, confirmation ref, HTTP
  status, snippet, who registered). Duplicate protection is per plate per
  venue-local day; an existing session is never resubmitted (the site allows one
  free claim per plate per day) and the UI offers the **EXTEND ON SCAN2PAY** link
  instead.
- **Flow** — server-side only (`lib/scan2pay.server.ts`): GET the SelectTime page
  with a manual cookie jar, read the ASP.NET antiforgery token, then POST
  `/Parking/CreateSession` with `EntryTime`/`ExitTime` as venue-local
  `yyyy-MM-ddTHH:mm:ss`. CreateSession redirects to a Payment page; the server
  extracts its `token`, POSTs `/Parking/ProcessPayment?token=…`
  (`{ CustomerEmail }` — the venue's FTP custom email when set, else blank) and
  follows the returned Confirmation page
  (`Payment Successful!`). A Stripe `sessionId` (a paid flow) is reported as
  `PAYMENT REQUIRED` instead of being silently confirmed. Times come from the
  arrival instant formatted in `Venue.timezone`; beyond 90 minutes is a Scan2Pay
  Stripe flow we link to, not automate. No official API exists — this is HTML
  form automation.
- **Worker** — **PARKING** tile (shown when guest parking OR staff plates are
  enabled) → `/w/parking` (`WorkerParkingClient` + `WorkerStaffPlateCard`): the
  guest form is the big plate input, arrival defaults to now with
  `-30/-15/-5/NOW` and a full `datetime-local` picker, one SUBMIT, success card
  with paid-until + confirmation + extend link, `ALREADY REGISTERED` card, and
  today's registrations. `/api/worker/parking/access` gates the tile and returns
  `{ enabled, staffParkingEnabled, health }`.
- **Health check** — `lib/parking-health.server.ts` runs daily at **05:00**
  (venue-local via the internal cron) and records `ParkingHealthCheck` rows.
  `READINESS` (default) only GETs the form with the fake plate — no session is
  created; `FULL` submits it end-to-end (a real $0 fake session); `OFF` disables
  it. A failed/stale (>36h) check warns in Settings, the admin dashboard
  **ATTENTION** widget and a **SERVICE WARNING** strip on the worker tile.
  `GET /api/cron/parking-health` (`CRON_SECRET`, `?force=1`) is the external
  fallback; `POST /api/admin/parking/health` is the manual RUN CHECK NOW.

| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/parking/config` | GET, PUT | Read/save the venue config (admin or own-venue manager) |
| `/api/admin/parking/health` | POST | Run a check now |
| `/api/admin/parking/registrations` | GET | Recent registrations (admin history) |
| `/api/worker/parking/access` | GET | `{ enabled, health }` for the dashboard tile |
| `/api/worker/parking` | GET, POST | Today's registrations; register a plate |
| `/api/cron/parking-health` | GET | External scheduler fallback |

**Deploy note:** additive only — `prisma db push` creates the three tables; no
data migration. The demo seed does not enable it. **Risk:** HTML automation and
one free claim per plate/day; treat the URL as private.


### Free the Carpark (FTP) — customer kiosk + staff plates (built 2026-11)

The public-facing layer on top of the guest-parking automation. Everything is
configured in **Settings → FTP** (a new `SETTINGS_TABS` entry, between SWIFT POS
and FILES). The tab is visible to ADMIN + MANAGER; the **kiosk code** section is
ADMIN-only. `FtpSettings` is one row per venue (`@@unique([venueId])`).

**Customer kiosk (`/park`, public).**
- A small **car icon** on the landing page (`/`) opens `/park`. The kiosk code is
  **opt-in** (`FtpSettings.kioskRequireCode`, default **OFF**): with it off the
  page resolves the venue from `?venue=` (the COPY URL) or the most recently
  updated open kiosk and goes straight to the plate screen. With it on, the iPad
  is unlocked once with a random code. The code is stored as a **sha256 hash**
  (`kioskCodeHash`) and the raw value is shown only once when set/rotated. The
  signed HTTP-only cookie (`hospo-parking-kiosk`, 30 days, JWT via
  `lib/parking-kiosk.server.ts`) carries `venueId` + the current `codeHash`, so
  **rotating the code invalidates every iPad**. Requiring the code without
  setting one returns 422.
- The customer flow uses a **custom on-screen keypad** (`PlateKeypad`), not a
  native input: no autocorrect and the layout never jumps. Plate boxes are 1–6
  alphanumeric. Register calls `POST /api/public/parking/kiosk/register` with the
  session cookie (or `venueId` when the code is off), reuses `registerParking`,
  and **writes nothing to the database** — the plate lives only in memory and in
  Scan2Pay's session.
- Result: big plate, `FREE PARKING UNTIL HH:MM` (or `ALREADY REGISTERED` with the
  existing expiry), a **large QR code** for the Scan2Pay `SelectTime` URL
  (“SCAN ME WITH YOUR PHONE CAMERA TO VIEW OR EXTEND”), and a **visible
  countdown** (`kioskAutoResetSeconds`, 15–300) with **START AGAIN**. At zero the
  plate/QR/result are wiped and the entry screen returns.
- Always-present **SPEAK WITH STAFF** opens `KioskStaffSheet`: the plate, end
  time, QR/open link, and the only exit. **EXIT KIOSK** requires a **5-second
  hold**; with the code on it then asks for the code (5 wrong codes lock for 60
  seconds), with the code off the hold reveals an EXIT KIOSK button. Settings
  recommends iPad **Guided Access** as the outer lock.
- The kiosk shows `90 MINUTE` and `4 HOUR` tabs; 4 HOUR is visibly disabled
  (“SOON”) until `fourHourEnabled` + a URL are saved.
- `/park/layout.tsx` is `force-dynamic`, `noindex`, fixed full-screen, and the
  page/API responses set `Cache-Control: no-store`.

**Staff number plates (worker app only).**
- `StaffParkingPlate` is the approved plate(s) per staff member (multiple rows
  allowed; `ACTIVE`/`RETIRED`, plus `enteredInSystem`/`enteredAt`/`enteredById`).
  `StaffParkingPlateRequest` is the append-only submission (`PENDING` /
  `APPROVED` / `REJECTED`, optional `previousPlate`, required `reason` when the
  person already has a plate, review stamp/note).
- Worker `/w/parking` → `WorkerStaffPlateCard`: current plates + whether they
  are in the parking system, pending requests, **ADD ANOTHER PLATE** and
  **CHANGE**. A first plate needs no reason; an add/change **requires a note**.
  Nothing changes until a manager approves.
- Admin **Settings → FTP → STAFF CAR PARK → STAFF NUMBER PLATES**
  (`StaffPlatesPanel`) is the single list: **TO APPROVE**, **TO ENTER**,
  **ALL PLATES**. APPROVE retires the specific replaced plate (an add keeps the
  others) and creates the new `ACTIVE` plate with `enteredInSystem: false`;
  REJECT closes the request. The **ENTERED IN SYSTEM** tick is manual for now.
- Staff plates are deliberately **worker-app only** — not exposed on the shared
  customer kiosk.

**Custom email.** `FtpSettings.contactEmail` is passed to
`registerParking({ customerEmail })` → `completePayment` as `CustomerEmail`, so
a form that asks for an email gets the venue's address without the guest typing
it. The 4-hour carpark settings (`fourHourName`, `fourHourEnabled`,
`fourHourEntryUrl`, `fourHourDurationMinutes`) are stored now; the flow arrives
with the real URL. `staffCarparkName` / `staffCarparkNotes` label the staff area.

**Pure libs.** `lib/parking-kiosk.ts` (cookie name, code formatting, plate
keypad, countdown; client-safe), `lib/parking-kiosk.server.ts` (sha256, random
code, signed cookie), `lib/staff-parking.ts` (submission/review rules,
replace-vs-add planning), `lib/ftp-settings.ts` (email/URL/duration validation +
view defaults) and `lib/rate-limit.ts` (in-memory fixed window for the public
routes).

| Route | Methods | Purpose |
|---|---|---|
| `/api/public/parking/kiosk/unlock` | POST | Verify the kiosk code, set the signed cookie |
| `/api/public/parking/kiosk/lock` | POST | Verify the code again and clear the cookie (exit) |
| `/api/public/parking/kiosk/register` | POST | Register a plate (session cookie, or `venueId` when the code is off; no DB write) |
| `/api/admin/parking/ftp` | GET, PUT | Read/save the FTP settings |
| `/api/admin/parking/ftp/kiosk-code` | POST | Mint/rotate the kiosk code (ADMIN only; raw shown once) |
| `/api/admin/parking/staff-plates` | GET | Requests + plates + counts for the admin list |
| `/api/admin/parking/staff-plates/[id]/review` | POST | APPROVE / REJECT a request |
| `/api/admin/parking/staff-plates/[id]` | PATCH | Toggle the ENTERED IN SYSTEM tick |
| `/api/worker/parking/staff-plate` | GET, POST | Own plates + requests; submit an add/change |

**Help.** The `free-the-carpark` Heavenly Help article (ADMIN / EVERYONE,
sortOrder 640) is a plain-English guide to setup, the customer flow, the exit,
staff plates and privacy. It ships with five screenshots:
`/help/ftp-settings.png`, `/help/ftp-kiosk.png`, `/help/ftp-kiosk-result.png`,
`/help/ftp-staff-plates.png` and `/help/ftp-worker-staff-plate.png`.

**Deploy note:** additive only — `prisma db push` creates `FtpSettings`,
`StaffParkingPlate` and `StaffParkingPlateRequest`; no data migration. The demo
seed does not enable the kiosk or staff plates.


### Unified staff identity
A single `Staff` profile carries external-system link IDs — `swiftPosId`,
`myHrId`, `loadedReportsId` — so one person maps across SwiftPOS, MyHR, and
LoadedReports. These are editable in the Staff form; SwiftPOS links sync from
Settings → SWIFT POS → STAFF SYNC, while MyHR/LoadedReports remain manual.
`email` doubles as a natural cross-system match key.

### Live structure map
`/admin/settings?tab=structure` (the `/admin/structure` stub redirects;
`StructureClient`) has two views, toggled by a **TREE / MAP** tab:

- **TREE** (`GET /api/admin/structure`) renders the live entity tree — venue →
  department → section → staff / tasks / training, plus a venue-wide bucket — as
  collapsible nodes with counts. The API also extends with
  `floorPlan { tables, chairs, equip }` per section.
- **MAP** (`GET /api/admin/structure/graph`) is an interactive node-graph
  (`StructureGraph`, React Flow / `@xyflow/react`, dynamic `ssr:false`) for
  mapping out workflows — how **lists** talk to **tasks** and **training/SOP**.
  Nodes are laid out left→right in workflow order (venue → department → section →
  staff → checklist → task → training) and edges encode every real relationship:
  `contains`/`member`/`works` (hierarchy), `scope` (dept/section scoping),
  `assigned` (task→person), `list-task` (checklist→task), `how-to`
  (module/step→task via `linkedTask`/`ModuleTask`/`StepLinkedTask`), `requires`
  (`TaskRequiredTraining`), `embeds` (step→checklist), `related` (`ResourceLink`).
  Click a node to focus it (its links highlight/animate, the rest dim); type-chip
  filters hide/show any layer; venue selector, drag, zoom, minimap. Layout/focus
  logic lives in the pure, unit-tested `lib/structure-graph.ts`
  (`buildGraphLayout`, `focusNeighbours`).

Manager sees own venue, admin sees all. Both views are read-only visual reviews.

### Responsive admin nav + hub routing
`AdminNav` renders a static sidebar on `md+` and, on mobile, a fixed top bar with
a burger button that opens an off-canvas drawer (closes on route change /
backdrop tap). The protected layout adds `pt-14 md:pt-0` so content clears the
fixed mobile bar.

Nav groups: **Dashboard** (Overview, Calendar, Kitchen) · **Ops hub** (Menu &
Services, Bookings, Orders, Customers, Inventory & Stocktake) · **Events**
(Enquiries, BEO Planner, Pipeline, Event Templates, Requests, Block Library,
Rooms & Plans) · **Team & execution** (Roster & Pay, Daily
Tasks, Training, Notices) · **Compliance** (Food Safety) · **Performance**
(Reports, Budget, Tips, Gift Cards) · **Setup & config** (Settings).
Nav items are filtered by permission area when the session is a restricted
manager (`NAV_ITEM_AREAS` + `sessionGrantedAreas`); the ops items map to their
real areas (`bookings` / `orders` / `customers`, not `ops`), and a filtered
group header follows its first visible item so it never deep-links to an
ungranted page. Overview and Settings stay deliberately ungated.

`lib/hub-tabs.ts` defines every hub's tabs (`OPS_AREAS`/`OPS_SUB_TABS`,
`TEAM_TABS`, `EXECUTION_TABS`, `TRAINING_TABS`, `SETTINGS_TABS`,
`COMPLIANCE_TABS`, `EVENTS_TABS`) and `lib/ops-redirect.ts` `hubRedirect()`
preserves non-tab query params. Old standalone URLs (`/admin/recipes`,
`/admin/orders`, `/admin/staff`, `/admin/review`, `/admin/guides`, …) are thin
redirect stubs into their hub — **add new pages as hub tabs, not new sidebar
entries**.

### Heavenly Help (#50)

The in-app user help is a **global, read-only catalogue**, not per-venue guides.

- `HelpArticle` (`slug @unique`, `title`, `summary`, `category`, `audience
  EVERYONE|ADMIN|WORKER`, `sortOrder`, `bodyHtml`, `contentHash`, soft delete) is
  global — no `venueId`.
- Content is the repo pack `apps/web/content/help/articles.ts`. **Edit the
  matching article in the same PR as a feature** (the coverage test asserts every
  required slug exists). `packages/db/prisma/seed-help.ts`
  (`npm run db:seed-help`, wired into `docker-entrypoint.sh` after `db:seed`)
  upserts by slug and writes only when `helpContentHash` changes; removed slugs
  are soft-deleted.
- `lib/help.ts` (pure) is the single audience/search/group/hash authority.
  `helpVisibleTo`: admins see EVERYONE + ADMIN, workers EVERYONE + WORKER.
- `GET /api/admin/help` (session) and `GET /api/worker/help` (worker session) are
  auth-only — no `training.playbook.view` grant, so restricted managers still get
  help. Both re-sanitise `bodyHtml` with `lib/rich-text.ts` `sanitiseHelpRichText`,
  which additionally allows `<img>` only for shipped `/help/...` screenshots (guide
  rich text still has no images).
- `HelpClient` renders `/admin/help` and `/w/help`. `AdminNav` has a bottom
  `✕ HEAVENLY HELP` link; the worker dashboard has a HEAVENLY HELP tile.



### Checklists (live task references) + re-train
- **Merged Tasks + Checklists.** The old copy-based `TaskTemplate` is retired from
  the UI (`/admin/templates` → redirects to `/admin/execution?tab=tasks`). A `Checklist` is an
  ordered set of references to **live** `Task` rows via `ChecklistTask`
  (`@@unique([checklistId, taskId])`). Editing a task updates every checklist —
  single source of truth, no duplication. Managed on the Tasks page under a
  CHECKLISTS tab (`ChecklistsPanel`); APIs at `/api/admin/checklists(+/[id])`.
  The Tasks page (`TasksClient`) is a 50/50 two-column layout: tasks (left,
  grouped Department → Section with a "general" bucket) and checklists (right).
  Checklist create/edit happens **inline in the right panel** (no modal); the
  editor has a **drop zone** — task rows on the left are `draggable` and set the
  task id on `dataTransfer`, dropping adds them; order is up/down + internal
  drag. `TasksClient` owns all the shared data (tasks/venues/depts/sections/
  checklists) behind one `load()`, so creating a task immediately refreshes the
  checklist picker (no more stale-until-refresh). Task rows clip long
  title/description (`truncate`, `min-w-0`) so the right-hand tags don't wrap,
  and show usage **labels** from the tasks API (`_count.checklistLinks` → LIST,
  linked/required module kinds → TRAINING / SOP / GUIDE). The right panel is
  sticky (`lg:sticky lg:top-6 lg:self-start lg:max-h-… lg:overflow-y-auto`) so it
  follows long task lists; the "add a task" dropdown is scoped to the checklist's
  department/section; the task list has search + section + usage filters.
- **Timed lists.** `Checklist.appearFromTime` ("HH:mm" venue-local) is the legacy
  every-day time gate. **Custom schedules** use `ChecklistSchedule` rows
  (`dayOfWeek` 0–6, `fromTime`, optional `toTime`; multiple windows per day
  allowed; soft-deleted wholesale on replace). When rows exist they replace
  `appearFromTime`; from/to compare as venue-local `HH:mm` and a null `toTime`
  means end of day (`23:59`). No rows = every day at `appearFromTime`, no time =
  always. `lib/checklist-activation.ts` is the single pure rule
  (`isChecklistOpen` / `isScheduleOpen` / `describeNextOpen` / `validateSchedules`)
  and `lib/task-outcomes.ts` uses the same `isChecklistOpen`, so a closed list is
  ignored for outcome policy too (falling back to DEFAULT rather than leaking a
  hidden list's defaults).
  The worker `GET /api/worker/tasks` computes `openNow` + an `opensNext` label
  (`OPENS THU 06:00`) **server-side** from `Venue.timezone`; the phone uses that
  verdict for grouping and the `OPENS LATER` badge and never derives custom days
  from its own clock. Both list editors (admin `TasksClient`, worker
  `WorkerTasksClient`) have a SCHEDULE section (SUN–SAT enable checkbox,
  FROM/TO time inputs, add/remove window) and save the whole `schedules` array;
  the legacy `appearFromTime` field stays visible as the fallback. Admin/worker
  checklist POST/PUT validate day 0–6 + `HH:mm` and replace the schedule
  wholesale (soft-deleting the old rows).
- **Task groups + bulk NOT_REQUIRED (#104).** `ChecklistTask.groupLabel`
  (`String?`) is a **checklist-scoped** free-text group ("OUTSIDE"). The same
  task can be ungrouped, or in another group, on a different list. `lib/task-groups.ts`
  (pure) owns `normaliseGroupLabel` / `parseTaskGroups` / `groupChecklistTasks`
  / `planBulkNotRequired`; `lib/task-groups.server.ts` resolves one list's group,
  re-checks every task against the same outcome policy the worker saw (due today
  or carrying a live multi-day PARTIAL, NOT REQUIRED allowed, reason requirement)
  and writes one normal `NOT_REQUIRED` `TaskCompletion` per eligible task plus
  deletes their `TaskProgress` rows in one transaction. Already-settled,
  off-schedule and policy-blocked tasks are reported as `skipped`; a required
  reason missing returns 422 and writes nothing. The worker list renders each
  group with a header and **MARK NOT REQUIRED** (confirmation popup required),
  and both checklist editors have a per-task `GROUP` input. `taskGroups` is an
  additive checklist POST/PUT field (`{taskId: label|null}`); GETs return
  `groupLabel` per task. Bulk undo/reopen stays per task (#87). Route:
  `POST /api/worker/checklists/[id]/not-required`.
- **Event-linked lists (Phase 3 of #68).** `ChecklistEvent` links a list to one
  or more `CalendarEvent` rows (`@@unique([checklistId, calendarEventId])`,
  soft-deleted wholesale on replace; the unique key spans deleted rows, so a
  re-selected event revives its link instead of failing). A linked list opens
  across each event's date/window (`startsAt`–`endsAt`, all-day = whole day,
  multi-day = each covered date, no end = end of day) and closes when no linked
  event is active — unless `activatedOn` force-opens it or a custom schedule
  window also opens it. Event times follow the existing venue-local wall-clock
  convention (UTC parts, as `event-roster`/`manual-event` do). Soft-deleted
  events are closed (CalendarEvent has no cancelled flag; the pure helper also
  accepts `cancelled` for future callers). `lib/checklist-activation.ts` gains
  `isEventActive` / `eventWindowOnDay` / `hasActiveEvent` / `summariseCalendarEvent`
  and `isChecklistOpen` / `describeNextOpen` take the linked events, so the
  worker verdict, `task-outcomes` policy and both list editors agree.
  `lib/checklist-events.server.ts` validates venue scope and performs the
  replace. Both checklist route sets accept `eventIds` (omitted = leave links
  untouched, empty array = clear) and return `events` on GET; the pickers load
  options from `GET /api/admin/calendar-events` / `GET /api/worker/calendar-events`
  and cards show an `EVENT: <title>` badge.
- **Printable PDF export.** A `⬇ PDF` button in the Tasks page header opens a
  modal listing every checklist; each row's DOWNLOAD hits
  `GET /api/admin/checklists/[id]/pdf` (session auth, MANAGER scoped to own
  venue) which renders a printable A4 checkbox list via
  `lib/checklist-pdf.ts` (pure, jspdf — same pattern as `gift-card-pdf.ts`):
  venue + checklist name header, description, "FROM HH:mm" line, blank
  DATE/STAFF fill-in lines, then numbered tasks with drawn checkbox squares
  (helvetica can't render `☐`, so boxes are rects), multi-page aware with
  page-numbered footer. Live task data, so a task edit is current in the PDF.
- **Checklist embedded in guides (legacy training only).** `TrainingStep.linkedChecklistId`
  let a legacy training/SOP step embed a whole checklist; the guide reader shows
  live task titles as an in-session tick-off list. Legacy — the Training UI is
  gone and the guide system owns this now.
- **Re-train on significant change.** `Task.version` / `TrainingModule.version`
  / `Guide.version` bump when a save includes `requireRetrain: true` (a "Require
  re-training" toggle on the Task and guide edit forms, with an optional
  `changeSummary`). `lib/retrain.ts:postRetrainNotice` then auto-creates a
  must-acknowledge `Notice` (priority IMPORTANT, pinned) targeted at the saved
  guide audiences (or the item's department, null = whole venue) — `NoticeAudience`
  mirrors `GuideAudience` so a section/position-scoped guide notifies only that
  group. Guide rules: only ADMIN/MANAGER can trigger it (floor editors can save
  but the flag is ignored), a DRAFT bumps the version but posts nothing until it
  is PUBLISHED, and a guide with no audience/department/onboarding is untargeted
  so it bumps the version without a notice (the editor shows a hint). Staff
  acknowledge via the existing `/w/notices` GOT IT flow; managers track acks on
  `/admin/notices`. Reuses notice/ack infra - no new worker screen. Best-effort
  (never blocks the save).
- **Task filter "NOT IN THIS LIST".** When creating or editing a checklist, a
  dynamic `'notinthis'` usage filter appears showing all tasks except the LIVE
  `clSelected` set — allowing tasks already used elsewhere to be added, and
  removing a just-dropped task from the left list immediately. Defaults to
  `'notinthis'` when opening the editor and resets to `nolist` on close/save.
- **One-day activation + audiences.** `Checklist.activatedOn` (venue-local date)
  is set by ACTIVATE NOW (`POST /api/admin/checklists/[id]/activate`) — the list
  shows for the rest of the local day then self-expires (no cron; next day
  doesn't match). `ChecklistAudience` rows (DEPARTMENT/SECTION/POSITION) scope a
  list; a list with no audiences keeps the legacy department scoping. The
  gated-lists panel with ACTIVATE/DEACTIVATE lives on the Execution → TASKS page.
  Note: the audience editor is API + resolver only — not surfaced in the UI yet.
- **Multi-day (side work) lists.** `Checklist.multiDay` (default false) marks a
  list whose tasks run over several days; its PARTIALs stay live until a terminal
  outcome (see "Carry-over details"). Toggled in both list editors; see issue #94.

### Linked subtasks (Phase 4 of #68, built 2026-11)

`Task.parentTaskId` + `subtaskOrder` (`@relation("TaskSubtasks")`, `@@index([parentTaskId])`)
lets one task be extended into linked children (the newspaper requirement: grab them
on one list, throw them away on another). **Max depth 1** — a task with a parent can
never be given a parent, and a task with children cannot become a subtask. Self-parent
and cross-venue parents are rejected. The parent stays a **normal completable task**;
parent and children keep independent `TaskCompletion` / `TaskProgress` rows and each
child can sit in any checklist independently. `lib/task-subtasks.ts` (pure, client-safe)
holds `validateParentTask`, `availableParentTasks`, `orderTasksWithChildren` and
`subtasksOutsideList`; `lib/task-subtasks.server.ts` does the Prisma lookups
(`parentLinkError`, `nextSubtaskOrder`, `hasLiveSubtasks`, `softDeleteTask`).

**Delete rule.** Soft-deleting a parent first clears its children's `parentTaskId`
(they stay usable as top-level tasks), then soft-deletes the parent. Deleting a child
only soft-deletes that child. Never hard-delete.

**API.** Admin/worker task `POST`/`PUT` accept `parentTaskId` (validated, order
computed); the admin task GET, worker task GET (including `?edit=1`) return
`parentTaskId`, `parentTitle`, `subtaskOrder` and `subtasks` (id/title/isActive plus
completion state where cheap). The admin DELETE uses `softDeleteTask(id, true)`; the
worker DELETE uses `softDeleteTask(id)`.

**UI.** Both task forms (`TasksClient`, `TaskEditModal`, worker task modal) have a
**PARENT TASK** picker and **+ ADD SUBTASK** (creates a child prefilled with the
parent's department/section/schedule/completion type, then opens it for editing), and
link to edit existing children. The admin task list indents children under their parent
with a collapse toggle. The worker list indents a child when the parent is in the same
open list; otherwise the child shows `PART OF <PARENT>` and the parent shows
`SUBTASKS IN OTHER LISTS`. A child in a closed list is never duplicated.

### Task item links + rich descriptions (built 2026-11)

`Task.linkedItemId` (previously only used by H&S READING tasks) is now exposed
on every task. The admin Tasks page and `TaskEditModal` have a searchable item
picker, and the worker task card/detail show the item plus its
`ItemStorageLocation` path (e.g. `BAR → UNDER SINK · TOP SHELF`).
`GET /api/admin/tasks/item-options?venueId=` is a narrow `execution.tasks.view`
endpoint (active items for one venue only). `Task.description` is now sanitised
rich text (`lib/rich-text.ts`), so bullet lists work in all four task editors
(admin `TasksClient`, `TaskEditModal`, `ComplianceTasksClient`, worker task
modal); existing plain-text rows remain valid. The formatter lives in the pure
`lib/item-location.ts`, and reads are re-sanitised on render.

### Section ecosystem (Phases A–D, built)
A layer between department and the work, plus a follow-up trigger loop. The
legacy `TrainingModule`-based "Resources/Competency" pieces below are
**superseded by Guides** (see "Playbook Guides") — the models survive only so
old deployments can migrate.

- **Sections** — `Section` (under `Department`; denormalised `venueId`). `Task.sectionId`
  + `TaskSection` (a task can cover several sections; a section implies its
  department — enforced in the task API). `Staff ⇄ Section` many-to-many
  (`StaffSection`). CRUD at `/admin/sections` (also embedded, venue-scoped, in
  Settings → VENUE SETUP via `SectionsClient` with a `scopeVenueId`); section
  pickers on the Task and Staff forms; rendered on the structure tree.
- **Legacy resources** — `TrainingModule.kind` (`ResourceKind`: TRAINING | SOP | FAQ | HOWTO),
  `ResourceSection`, `ResourceLink`. Authored on the old Training page — the
  guide system now owns all of this.
- **Competency** — `TaskGuide.isRequiredForCompetency` replaces
  `TaskRequiredTraining` for new work (the old model is still honoured by
  `lib/followups.ts`).
- **Triggers** — `FollowUp` (`FollowUpKind` MISSED | UNTRAINED | INCORRECT,
  `FollowUpStatus`, `@@unique([venueId, staffId, kind, taskId, dueDate])` for
  idempotency). `lib/followups.ts`: `checkUntrainedOnCompletion` (called from the
  worker complete route) raises UNTRAINED at completion; `generateVenueFollowUps`
  (run on the Follow-ups page load + RE-SCAN) raises MISSED for assigned tasks with
  required training and auto-assigns that training. Surface: `/admin/execution?tab=followups`
  (`GET /api/admin/followups?generate=1`, `PATCH …/[id]` resolve|signoff). In-app
  only for now (push/WhatsApp later).

## KEY ARCHITECTURAL DECISIONS

### Dual auth system
- **Admin**: NextAuth.js with Credentials provider — creates a JWT session cookie (`next-auth.session-token`). Suitable for desktop, supports 8-hour sessions.
- **Worker**: Custom JWT in an HTTP-only cookie (`hospo-worker-session`). Minimal — just stores staffId, venueId, and expiry. The idle timeout is **per venue** (`Venue.workerSessionTimeoutMinutes`, clamp 5–480; null/0 falls back to `WORKER_SESSION_EXPIRY_MINUTES`). An active phone slides the session forward: `WorkerSessionGuard` (mounted in `app/w/(authenticated)/layout.tsx`) owns the single idle timer in the top window, reports activity from embedded iframes via `worker-activity` messages, and calls `POST /api/worker/session/refresh` (throttled to once per max(60s, timeout/3)). On idle it calls `/api/worker/logout` and redirects to `/w/login`; it never clears the admin NextAuth cookie unless the user explicitly signs out.

**Worker session routes:**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/worker/session` | GET | `{ timeoutMinutes, expiresAt, refreshAfterMs }` for the guard |
| `/api/worker/session/refresh` | POST | Re-mint the current worker JWT/cookie with a fresh expiry (server-side throttled; 401 if the venue is disabled) |

### Route structure
- Admin routes live under `app/admin/(protected)/` — the inner route group applies the auth layout without affecting URL structure.
- Worker routes live under `app/w/(authenticated)/` — same pattern.
- The **landing page (`/`)** is a split screen: the left panel links to the worker area (`/w/login`); the right panel is the admin email/password login (inline `signIn`). There is **no separate `/admin/login` page** — the old one was removed and its login form now lives on `/`. NextAuth `signIn` page, the middleware guard on `/admin/*`, the protected admin layout, and the AdminNav sign-out all redirect to `/`. The worker venue picker also has an "ADMIN PANEL" box that links back to `/`.
- Worker login (`/w/login`) is outside the authenticated group so it doesn't inherit the auth check.

### Soft deletes everywhere
Every model has `deletedAt DateTime?`. Set `deletedAt: new Date()` to delete. Never use Prisma `delete()`. Always add `where: { deletedAt: null }` to all queries.

### ALL CAPS convention
Task titles, venue names, department names, and staff names are stored in UPPERCASE. Apply `.toUpperCase().trim()` before every insert/update.

### Permissions (restricted managers + staff grants)
`lib/permissions/registry.ts` defines `PERMISSION_TREE` — 14 areas (dashboard,
calendar, ops, bookings, orders, customers, events, team, execution, training,
compliance, performance, floorplans, notices) → sub-areas → function keys, plus
5 presets (OWNER / BAR / KITCHEN / FOH / H&S). `lib/permissions.ts` provides
`resolveAccess`, `staffHasPermission`, `canAccess` (venue via the
`admin-active-venue` cookie), `guardAccess` (403) and `sessionGrantedAreas`
(nav gating). Admin API routes call `guardAccess(session, req, 'key')`.

Grants live in `StaffPermission` (staffId + venueId + permissionKey) and only
matter when `Staff.restricted = true` — an unrestricted MANAGER keeps legacy
full access; ADMIN always bypasses. `StaffAccessDrawer` (admin-only, on the
Team → STAFF tab) edits grants per venue, with an **APPLY ROLE DEFAULTS** button
that copies `PositionPermission` defaults. Granting any function implies its
sub-area `view` (`completeGrantSet`).

### Venue sharing (multi-venue)

Per-venue opt-in via `Venue.sharingEnabled`. When enabled for a venue:

| Feature | Model | Behaviour |
|---|---|---|
| Staff multi-venue | `StaffVenue` (staffId, venueId, @@unique) | Staff can work at multiple venues. `auth.ts` loads all venue IDs into `availableVenueIds` in the JWT. `VenueSwitcher` shows a dropdown for multi-venue managers. Worker login checks both `staff.venueId` and `StaffVenue`. |
| WooCommerce source | `Venue.sharedWooVenueId` (self-FK) | A venue can point to another venue's WooCommerce integration. `lib/woo-sync.ts`, `lib/woo-orders-sync.ts`, `lib/woo-push.ts` all call `resolveWooVenueId()` before sync/push. Settings WooCommerce GET returns the source venue's data read-only; PUT is blocked. |
| Product sharing | `MenuItemVenue` (menuItemId, venueId, priceOverride, @@unique) | Products can be shared to other venues with optional price overrides. `GET /api/admin/menu-items` returns local + shared items. `PATCH /api/admin/menu-item-venues/[id]` updates overrides. Shared items show blue `(SHARED FROM X)` badge in the menu items list. |

Key helpers in `lib/venue-scope.ts`: `getManagerVenueId(session, req)` returns the effective venue ID from the `admin-active-venue` cookie, and `getAccessibleVenueIds(session)` returns all venue IDs the user can access.

### Department linking

`DepartmentLink` (fromDepartmentId, toDepartmentId, @@unique) — M:M self-referential junction on `Department`. When a department links to another:

- **Worker task list** (`/api/worker/tasks`): resolves linked departments from `DepartmentLink`, includes their tasks/checklists via `departmentId: { in: [...linkedIds] }`
- **Admin task list** (`/api/admin/tasks`): same resolution when filtering by department
- **List applicability** (`lib/checklist-applicability.server.ts`): a `ChecklistAudience` of kind `DEPARTMENT` matches the staff member's home department **and every linked department** (pure `checklistApplicabilityWhere` in `lib/checklist-applicability.ts`) — the same scope the worker task query uses. Without this, a list scoped to a linked department was hidden while its tasks still appeared, so they rendered in the worker's Department -> Section bucket instead of inside the list.
- **Department UI** (`OrganisationClient`): SearchSelect-style inline picker in the EDIT modal; selected departments appear as removable tags
- **Structure tree** (`StructureClient`): shows `→ DEPT1, DEPT2` arrows on department nodes

### Prisma client singleton
`packages/db/index.ts` exports a global singleton Prisma client to prevent connection pool exhaustion in Next.js dev (hot reload creates new instances without this pattern).

### Floor plan scale, coordinate system, and rendering
All positions and dimensions are stored in real-world centimetres. The room dimensions
(`roomWidth`, `roomDepth`) are set at plan creation. The canvas uses a **room.scale** transform
(not per-element pixel math) — elements drawn in raw cm, the container transform handles
zoom/pan via `room.scale + room.position`. ViewState `{ baseScale, ox, oy, zoom, panX, panY }`
is shared with parent via `viewRef` for coordinate conversion on drops. Grid snapping snaps to
`gridUnit` cm via `edgeSnap(v, size, unit)` (snaps to nearest grid line — left OR right edge).
The bulk element save (`PUT /api/admin/floorplan/[id]/elements`) diffs incoming IDs vs existing
DB IDs — soft-deletes removed elements, updates existing, creates new ones (all in one
transaction). The API also accepts an `inventoryLinks` array for atomic create/remove of
`ElementInventoryItem` rows, returning `{ saved: [{ id, _clientId }], deleted, zonesSaved }`
so the client maps temp IDs to real DB IDs and updates local state.

Since switching from Konva to PixiJS:
- Element drag uses **pointer-delta** (capture start pos + cumulative delta on stage move/up)
  — Konva's draggable + React caused unresolvable event target and race condition bugs.
- Full-screen via ResizeObserver (no hardcoded stageW/stageH or CANVAS_PAD).
- Canvas clamp prevents elements exiting room bounds.
- `konva` + `react-konva` have been removed from package.json.

### PixiJS canvas rendering
The floor plan canvas uses `pixi.js` v7.3.3 via a custom `FloorPlanPixiCanvas` component
(no React-Pixi wrapper — raw PIXI.Application managed in a ref). SSR is avoided by using
`next/dynamic` with `ssr: false` for both admin editor and worker view (no special SSR
handling needed — PixiJS doesn't crash on SSR, but it has no DOM node until mounted).
The `konva` and `react-konva` packages have been removed from `package.json`.
The `npm overrides` for React 18 in root `package.json` have been removed (they existed only because `react-konva@18` required React 18 while `next-auth` peer-deps allow React 19).

### Task scheduling
Tasks are filtered on-demand (no generation table). `lib/scheduling.ts`
`isTaskDueOnDate(task, date)` is the single source of truth, used by the worker
task list, the dashboard, and the overdue engine:
- `DAILY`: always due
- `WEEKLY`: due if `scheduleDays` contains the date's day-of-week (0=Sun)
- `MONTHLY`: due if the date matches `monthlyOption` (FIRST_DAY / LAST_DAY /
  FIFTEENTH / FIRST_WEEKDAY / LAST_WEEKDAY / FIRST_MONDAY / LAST_FRIDAY /
  SPECIFIC_DAY+`monthlyDay`) AND, when `intervalMonths` > 1, the month is on the
  every-N cadence anchored on `createdAt`'s month.
- `CUSTOM`: due if the `customCron` expression fires on that date (evaluated
  with `cron-parser`, day-granular)

`describeSchedule(task)` (also in `lib/scheduling.ts`) renders the human label
shown on each task — e.g. "MON, WED, FRI" or "EVERY 3 MONTHS · END OF MONTH".
`MONTHLY_OPTIONS` is the option list for the task form. Routes that evaluate
due-dates must select the monthly fields + `createdAt` (worker/overdue/dashboard
use full task objects; calendar + `lib/followups.ts` select them explicitly).

**Per-venue timezone:** "today" is computed in each venue's own timezone via
`getTodayDate(venue.timezone)` (set on the venue, default `Pacific/Auckland`).
This is used by the worker task list, the worker completion stamp
(`scheduledDate`), the dashboard, and the overdue engine — so a venue's daily
tasks reset at its local midnight, not UTC. `getTodayDate(tz)` returns the
venue-local calendar day anchored to UTC midnight; `formatDateKey` and
`isTaskDueOnDate` both work in UTC on that value, so storage, matching, and
weekday/cron evaluation stay consistent regardless of the server's own tz.

### Overdue / missed tasks
`/api/admin/overdue?days=N` computes, for each active task across the last N days
(excluding today), whether it was due (via `isTaskDueOnDate`) but has no
`TaskCompletion` for that date — gated by the task's `createdAt` so new tasks
aren't flagged retroactively. Surfaced on the dashboard as "MISSED — LAST 7 DAYS".

`TaskCompletion.scheduledDate` is the **calendar date** the task was for (not when it was submitted), allowing completion tracking across timezones.

### Undoing a task completion (#87, built 2026-11)

A completion is a **shared** row (`taskId + scheduledDate`, any worker). `TaskCompletion`
now carries `deletedAt`, `undoneById`, `undoneAt` (nullable) so an accidental tick can
be retracted without losing the audit row. `DELETE /api/worker/tasks/[id]/complete`
soft-deletes **today's** active completion, records who undid it, resolves an open
`UNTRAINED` follow-up for that task/staff/day and re-runs `reconcileSectionWork`
(best-effort). Any authenticated worker in the venue may undo, mirroring "anyone can
complete". Historical retraction is out of scope.

Every live `TaskCompletion` read filters `deletedAt: null` — worker list/rollover/subtasks,
the complete route's duplicate check, dashboard, review, overdue, reports
(`lib/report-filters.ts`), compliance summary, `followups`, and pathway progress. The
worker payload gains `canUndo: true` for today's active completion. `/w/tasks` keeps
**settled tasks inside their list at the bottom** (outcome badge + `UNTICK` for DONE /
`REOPEN` for non-DONE) instead of separate global COMPLETED/HANDLED sections; an all-done
day shows a banner above the list, never a full-page replacement.

### Shared floor task list (worker view)
The worker task view (`/w/tasks`, `WorkerTasksClient`) shows the **whole
department's** due tasks for the day (the assignee filter was removed — everyone
on the floor sees every list), grouped by **Department → Section**. Completion is
**shared/global**: `GET /api/worker/tasks` marks a task done if *any*
`TaskCompletion` exists for that task on the venue-local day, and the complete
route blocks a second completion by checking `taskId + scheduledDate` (not
staffId). So once anyone ticks a job it's done for the team (the list shows "BY
<name>"), preventing double-ups. Personally-assigned tasks still show, tagged
`FOR <name>`, but anyone can complete them.

**Live refresh (#96, built 2026-11).** The dashboard TASKS tile and the open
`/w/tasks` list poll `GET /api/worker/tasks` every 30 s **while the tab is
visible**, refresh immediately on `visibilitychange` → visible / window `focus`
and (dashboard) on returning from an iframe tile or browser back, and update in
place without a LOADING flash. Polling **pauses** while a task/checklist editor,
a task completion modal or edit mode is open so an in-flight form is never
clobbered. The shared hook is `lib/use-live-refresh.ts` (`shouldPoll` +
`useLiveRefresh`); it is the one place the timer/visibility/focus logic lives.

### Task outcomes, PARTIAL carry-over & admin hierarchy (built 2026-10)

Opening a worker task now asks **what happened**, not just "Mark Done":

| Outcome | Terminal? | Counts as complete? | Behaviour |
|---|---|---|---|
| `DONE` | yes | yes | Normal completion; reading alerts + untrained follow-up apply. |
| `PARTIAL` | **no** | no | Saves/updates a `TaskProgress` row (one per task) and keeps the task on the floor across refreshes **and later days** until a terminal outcome is recorded. |
| `NOT_REQUIRED` | yes | no | Settles the day; not a completion for metrics/follow-ups. |
| `DID_NOT_COMPLETE` | yes | no | Settles the day but remains a candidate for a MISSED follow-up. |

**Hierarchy — checklist defaults, task override.** `Checklist.allowedOutcomes` /
`Checklist.requireOutcomeReason` are the defaults for every task in the list.
A task can opt in with `Task.overrideOutcomes: true` and its own
`allowedOutcomes` / `requireOutcomeReason` (an empty override array means "only
DONE"). The first **open** checklist containing the task supplies the policy,
matching how the worker groups tasks under a list; a task override always wins.
**DONE is always allowed** — resolving never removes it. The pure resolver is
`lib/task-outcomes.ts` (`normaliseOutcomes`, `resolveOutcomePolicy`,
`resolveOutcomePolicyForChecklists`, `outcomeValidationError`), shared by the
worker GET/completion routes and both admin/manager editors. Add outcomes in
`TaskOutcome` + that file; don't branch on strings in components. Checklist
applicability (department / linked department / section / position audiences)
lives in `lib/checklist-applicability.server.ts` so the worker list and the
completion endpoint resolve the same policy.

**Reason requirements are deliberately a policy, not a hard-coded rule.** The
admin toggle `requireOutcomeReason` makes a note mandatory for every non-DONE
outcome. This is the extension point for the planned **per-staff trust /
re-training / training** rules: a future resolver should combine the task/list
policy with the staff member's competency and history (e.g. a newly trained or
under-review person must give a reason or take a photo, a long-tenured trusted
person need not). Keep that decision in one resolver so follow-ups and the
worker UI cannot drift. The note is stored on the completion/progress row and is
visible in the review/report surfaces; it is the raw material for follow-up
review.

**Counting semantics.** Only `DONE` counts towards the worker progress bar and
the admin dashboard completion percentage. `NOT_REQUIRED` and
`DID_NOT_COMPLETE` settle the day but are shown separately (worker "HANDLED —
NOT DONE", review list). `DID_NOT_COMPLETE` is **not** treated as handled by
`/api/admin/overdue` or `lib/followups.ts`; `NOT_REQUIRED` is. A task with a
`TaskProgress` row is treated as in progress by follow-ups (no MISSED row while
the floor is still working on it), and pathway task nodes only count `DONE`
completions.

**Carry-over details (day-aware, #94).** `TaskProgress.taskId` is unique, so
there is one shared in-progress state per task, and `TaskProgress.progressDate`
(venue-local `@db.Date`) records the day it was reported. `lib/task-progress.ts`
is the single pure rule: a PARTIAL carries into today only when its
`progressDate` is today **or** the task sits in a multi-day list. A PARTIAL left
on a daily list therefore **resets the next venue day**; a null `progressDate`
(legacy row) is stale. The worker GET filters on `carryTaskToday`, only exposes
`inProgress` for a live row, and best-effort `deleteMany`s stale today-only
rows for the venue (never a multi-day task's row). `lib/followups.ts` treats a
partial as in-progress **per day** (multi-day always live), so yesterday's
partial no longer suppresses MISSED. A terminal outcome deletes the progress
row in the same transaction as the completion. The worker card shows
`IN PROGRESS · <name>` with the latest note; a list stays visible until every
task is **settled** (DONE / NOT_REQUIRED / DID_NOT_COMPLETE), not only DONE.

**Multi-day lists (#94).** `Checklist.multiDay` (default false) is the
SIDE WORK / MULTI-DAY flag, edited in both list editors and persisted through
the admin + worker checklist POST/PUT. When true, its tasks' PARTIALs stay live
across days until a terminal outcome.

**Finished work collapse (#95).** The worker list hides settled tasks by
default; each list (and each non-list department/section) has a
`SHOW FINISHED (n)` / `HIDE FINISHED` toggle, a fully-settled list sorts to the
bottom and stays collapsed (header/`ALL FINISHED · TAP TO VIEW` toggles it), and
#87 UNTICK/REOPEN still work once revealed. Settled cards are greyed
(`opacity-60`, `cursor-default`); status boxes are coloured — green tick (DONE),
dark box + `—` with a black strike (NOT_REQUIRED), red `✕`
(DID_NOT_COMPLETE), warning border (in progress), grey (pending). The progress
bar still counts **DONE only**.

**Completion resilience (#33).** The worker completion POST is bounded by a 20 s
`AbortController` and always resets the button; a timeout/network failure shows
`REQUEST TIMED OUT` / `COULD NOT CONNECT` with retry, and a 401 redirects to
`/w/login`. The route also dispatches `checkUntrainedOnCompletion` and
`reconcileSectionWork` fire-and-forget — their own contract is "never block the
completion", and awaiting them could hold the response open.

**Worker chrome.** The dashboard hosts worker pages in an iframe with a single
bottom "BACK TO DASHBOARD" bar. Pages with a full-screen detail view (task
modal, availability day editor, guide reader/editor, delivery/event editor) call
`useWorkerImmersive(...)`; the dashboard hides the bar while that flag is on.
The dashboard also keeps a history guard so browser back returns to
`/w/dashboard` and never drops staff out of `/w/*`. Top-left back buttons are
bordered (`border border-grey-mid`) so they read as buttons.

### Budget (Phase 4, built)
Weighted multi-category monthly budget tool with department-linked breakdowns.

**Models (4):** `BudgetPeriod` (venueId, year, month, totalBudget, dailyWeights Json), `BudgetCategory` (name, percentage, optional departmentId), `BudgetDay` (date @db.Date, isWorkingDay), `BudgetDayAllocation` (amount, note). Categories link to departments via `departmentId String?` with `'__venue__'` sentinel for venue-wide items. REVENUE is a special-cased category at 100% — always present, never removable. Soft-delete on BudgetPeriod and BudgetCategory.

**Math engine (`lib/budget-math.ts`):** `generateDailyBudgetsNormalized(totalBudget, categories, dailyWeights, days, existingAllocations?)` — normalizes weekday weight profile against actual working days in the month, rounds per-day REVENUE to nearest $500, and applies post-rounding correction (never under budget). `computeBreakdowns(result, breakdownCategories)` takes the REVENUE-only result and computes sub-amounts per category as `revenue × cat%` rounded $500. `BreakdownInput`, `DailyBudgetWithBreakdowns`, `BudgetMathResultWithBreakdowns` types are exported.

**API routes:**
- `GET /api/admin/budget?year=&month=&venueId=` — returns `{ period }` with allocations flattened, or `{ period: null, defaults: { categories } }` when empty — defaults auto-copied from most recent period WITH categories (`categories.some` filter skips empty periods)
- `POST /api/admin/budget` — create/upsert period + generate BudgetDay rows for all calendar days via `monthDays()`
- `PUT /api/admin/budget/[id]` — bulk save via `$transaction`: upserts categories (by id with `deletedAt` restore), updates day working flags, upserts BudgetDayAllocation (by `budgetDayId_budgetCategoryId` composite key). Sanitises `departmentId`: `'__venue__'` and `''` → `null` before DB to avoid FK constraint violations
- `DELETE /api/admin/budget/[id]` — soft-delete via `deletedAt`
- `POST /api/admin/budget/sync-breakdowns` — receives `{ venueId, sourceCategories }`, iterates all periods for venue, upserts categories by name match, soft-deletes unmatched

**Components:**
- `BudgetMonthSelector` — DateNav-styled month bar (`<< YEAR · < MONTH · THIS MONTH · MONTH > · YEAR >>`) for `/admin/budget/[year]/[month]`. The old 12-month grid landing is gone; `/admin/budget` redirects to the current month. Venue selector inline, auto-defaults to first venue for admins.
- `BudgetSetupPanel` — 2-column dashboard: left = ALLOCATION (total budget, REVENUE locked at 100%, indented breakdown rows with department Select + `VENUE` option, auto-REMAINDER read-only row, progress bar); right = DAILY WEIGHTING (MON-SUN with 100% validation bar) + SUMMARY (TARGET/ALLOCATED/VARIANCE stats + GENERATE/SAVE/DELETE buttons). `↻ SYNC BREAKDOWNS` pushes categories to all venue months. Has a top tab bar — **ALLOCATION** (this panel) / **P&L LINES** (see below).
- `BudgetLinesPanel` + `BudgetImportModal` — see "P&L budget lines" below.
- `BudgetDailyGrid` — ISO week grouping into `lg:grid-cols-2` card grid. Week headers show date range + summed total. Single editable REVENUE input per day (no NOTE). Inline read-only breakdown text `BEV: $945 | REM: $2,205`. State lifted to parent — edits update `allocations` → stats recompute in SUMMARY panel.
- `BudgetPageClient` — state coordinator. Computes `budgetStats` from `allocations` state. Manages venue selection, API load/save/delete/generate/sync flows.

### P&L budget lines (built 2026-08)

A second, independent layer on top of the %-breakdown. `BudgetLine` rows live on
`BudgetPeriod` (per-month copies — same pattern as `BudgetCategory`) with a
self-FK hierarchy (`parentId`), an optional `sectionId` (Section ecosystem —
lines roll up across the venue), and `kind: BudgetLineKind` = `GROUP | LINE | TOTAL`.
TOTAL rows never store an amount — the read path sums their LINE siblings under
the same parent (`lib/budget-lines-import.ts` `buildLineTree`).

**Excel import:** the P&L LINES tab (`BudgetLinesPanel`) imports a monthly P&L
workbook (12 month columns). The client sends the .xlsx as **base64 JSON** to
`POST /api/admin/budget-lines/import`, parsed with **`read-excel-file`** (note:
the Node entry accepts a path or Readable stream, **not** a Buffer — the route
wraps the decoded buffer in `Readable.from()`; the package ships no `types`
field, so `types/read-excel-file.d.ts` declares the minimal ambient types).
The pure parser (`parsePnlRows`, 18 Vitest tests) detects: the month header row
(JUN–MAY aliases incl. SEPT, scanned within the first 15 rows), col-A section
groups (depth 0), col-B label-only sub-groups (depth 1), data lines (depth 2),
TOTAL rows (label contains "TOTAL", case-insensitive), `%` rows (SKIP by
default), and value rows following a TOTAL become standalone computed rows
(depth 0) until the next GROUP. `assignParentIndexes` rebuilds the hierarchy
from depths (GROUP rows are the only parents); `monthYearForName` maps Jun–May
across the financial-year boundary (base year = the year of June, JAN–MAY roll
into year+1); `treeTotal` sums every LINE amount for the venue-wide figure.

The preview modal (`BudgetImportModal`) lets the admin toggle include/skip per
row, fix kind/label, and assign a section. `POST .../import/commit` creates (or
fills) a `BudgetPeriod` per month column — new periods seed `totalBudget` from
the first TOTAL row's value; months whose period **already has lines are
skipped** (re-import never duplicates) — then creates all lines with hierarchy
in one transaction. `budget-lines-import.test.ts` (18) mirrors the real Eatery
workbook layout; verified against the actual `mock_data/Eatery.xlsx`.

**API routes:**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/budget-lines` | GET, POST | Period's lines + venue sections / add a line (upserts period) |
| `/api/admin/budget-lines/[id]` | PUT, DELETE | Edit name/kind/section/parent/amount; soft-delete the whole subtree |
| `/api/admin/budget-lines/import` | POST | base64 xlsx + venueId + year → parse preview (no writes) |
| `/api/admin/budget-lines/import/commit` | POST | Preview selections → create periods + lines (transaction) |


_The old `TaskTemplate` copy-based templates section is retired from the UI —
`/admin/templates` redirects to Execution → TASKS, which manages live
`Checklist` references instead. The `TaskTemplate` + `TaskTemplateItem` models
still exist for backup compatibility, and applying a template
(`POST /api/admin/templates/[id]/apply`) bulk-creates `Task` rows in a chosen
department, skipping duplicates. `POST /api/admin/templates/from-department`
snapshots a department's active tasks into a new template._

## NAMING CONVENTIONS

- All primary keys: UUID `@default(uuid())`
- All tables: `createdAt`, `updatedAt`, `deletedAt` (soft delete)
- Enums: `SCREAMING_SNAKE_CASE`
- Task titles, venue/department names: stored and displayed in `UPPERCASE`
- UI labels, nav items, buttons: `text-transform: uppercase` via Tailwind/CSS
- API routes: `/api/admin/*` (admin) and `/api/worker/*` (worker)
- Components: `PascalCase.tsx`
- Client components: always marked `'use client'`

## SEED DATA CONVENTIONS

When modifying the seed file (`packages/db/prisma/seed.ts`), follow these patterns:

### Demo venue architecture

A seeded **demo venue** (`Venue.isDemo: true`, id `00000000-0000-0000-00d0-000000000001`)
holds all sample data — departments, staff, tasks, checklists, guides, pathways,
a BEO event, a delivery, tips. The demo venue is
separate from real user data and can be disabled in **Settings → DEMO VENUE** (admin only).

| Area | Behaviour |
|---|---|
| Auth login | `authorize()` blocks MANAGER login when demo venue is disabled (`isActive: false`). ADMIN always logs in. `venueIsDemo` is stamped in the NextAuth JWT/session. |
| Write blocking | `middleware.ts` + `lib/demo-block.ts` (pure, tested) blocks non-GET requests to `/api/admin/*` for demo-venue managers (403 "read-only"). ADMIN bypasses. Workers (task completions etc.) are NOT blocked. |
| Sync isolation | `woo-sync.ts`, `woo-orders-sync.ts`, `webhook/woocommerce` filter integrations by `venue: { isDemo: false }`. `external-sync.ts` excludes demo venues. `expiry-scan.ts` skips demo-venue items. Woo settings PUT is blocked for demo venues. |
| Venue visibility | Disabled demo venues are hidden from `/api/venues` (worker picker), `/api/admin/venues` (admin switcher), and overdue tasks are filtered out (`NOT: { isDemo: true, isActive: false }`). |
| Seed lifecycle | Fresh install: demo created **active**. Existing install with real venues: demo created **disabled**. Legacy demo entities (old `...0001` prefix UUIDs) are auto-cleaned from non-demo venues on every seed run — staff are kept if their email was changed (repurposed account), otherwise soft-deleted with `email: null` to free the `@demo.com` email. The bootstrap admin (`...0020`) is NEVER touched and its credentials are NEVER reset on re-deploy (`update: {}`). |

New demo entities use UUID pattern `00000000-0000-0000-00dX-XXXXXXXXXXXX` (prefix `00dX`).
The helper `d(id)` in seed.ts generates these: `d('000000000020')` → demo admin staff UUID.
Current demo prefixes: `00d0` venue/staff/tasks/QR, `00d1` checklists + guides,
`00d2` pathways, `00d3` pathway nodes, `00d4` events/BEO, `00d5` event templates,
`00d9` tips, `00da` demo menu product + option groups/choices.

### Fixed IDs for reproducibility
Every seed entity uses a hardcoded UUID in the `00000000-0000-0000-XXXX-0000000000YY` pattern where `XXXX` is an entity-group prefix and `YY` is a zero-padded counter. This makes upserts idempotent and safe to re-run.

| Prefix | Entity |
|--------|--------|
| `0001` | Department tasks (daily, legacy) |
| `0002` | Department tasks (weekly, legacy) |
| `0010` | Departments (legacy) |
| `0020` | Staff (bootstrap admin) |
| `0030` | QR Codes (legacy) |
| `00a0` | Task templates |
| `00b0` | Training modules |
| `00d0`-`00d5` | Demo-venue entities (venue/staff, checklists+guides, pathways, nodes, events, templates) |
| `00d9` | Demo tips period |
| `00da` | Demo menu product + option groups/choices |

### Staff seeding pattern
```typescript
const pwHash = await bcrypt.hash('password', 10)
const staff = await prisma.staff.upsert({
  where: { id: 'FIXED-UUID-HERE' },
  update: { email: 'user@demo.com', password: pwHash },  // update keeps login current
  create: {
    id: 'FIXED-UUID-HERE',
    firstName: 'FIRST',       // UPPERCASE
    lastName: 'LAST',          // UPPERCASE
    pin: pinHash,
    email: 'user@demo.com',
    password: pwHash,
    role: Role.MANAGER,
    venueId: venue.id,
    departmentId: deptX.id,
    hourlyRate: 25,            // optional, for payroll
    employmentType: 'FULL_TIME', // optional: FULL_TIME | PART_TIME | CASUAL
    isActive: true,
  },
})
```

### Department seeding pattern
```typescript
const dept = await prisma.department.upsert({
  where: { id: 'FIXED-UUID' },
  update: {},
  create: {
    id: 'FIXED-UUID',
    name: 'BACK OF HOUSE',    // UPPERCASE
    venueId: venue.id,
    colour: '#FACC15',        // hex colour for UI badge
    isActive: true,
  },
})
```

### Task seeding pattern
```typescript
const dailyTasks = [
  { title: 'TASK TITLE', description: 'What to do', type: CompletionType.TICK },
  { title: 'TASK WITH PHOTO', description: 'Snap a pic', type: CompletionType.TICK_PHOTO },
]
for (let i = 0; i < dailyTasks.length; i++) {
  const { type, ...task } = dailyTasks[i]
  await prisma.task.upsert({
    where: { id: `00000000-0000-0000-0001-${String(i).padStart(12, '0')}` },
    update: {},
    create: {
      id: `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`,
      ...task,
      venueId: venue.id,
      departmentId: dept.id,
      completionType: type,
      scheduleType: ScheduleType.DAILY,
      scheduleDays: [],
      sortOrder: i,
      isActive: true,
    },
  })
}

// Weekly tasks use scheduleDays: [dayOfWeek] (0=Sun, 1=Mon, ...)
const weeklyTasks = [
  { title: 'WEEKLY CLEAN', description: 'Deep clean', days: [1] }, // Monday
]
for (let i = 0; i < weeklyTasks.length; i++) {
  const { days, ...task } = weeklyTasks[i]
  await prisma.task.upsert({
    where: { id: `00000000-0000-0000-0002-${String(i).padStart(12, '0')}` },
    update: {},
    create: {
      id: `00000000-0000-0000-0002-${String(i).padStart(12, '0')}`,
      ...task,
      venueId: venue.id,
      departmentId: dept.id,
      completionType: CompletionType.TICK_NOTE,
      scheduleType: ScheduleType.WEEKLY,
      scheduleDays: days,
      sortOrder: dailyTasks.length + i,
      isActive: true,
    },
  })
}
```

### Template seeding pattern
Built-in templates use `upsert` with `update: { name, description, category, isBuiltIn: true }` so re-seeding refreshes them. Items are deleted and recreated via `deleteMany` + `createMany` to stay in sync:

```typescript
await prisma.taskTemplate.upsert({
  where: { id: tpl.id },
  update: { name: tpl.name, description: tpl.description, category: tpl.category, isBuiltIn: true },
  create: { id: tpl.id, name: tpl.name, description: tpl.description, category: tpl.category, isBuiltIn: true, venueId: null },
})
await prisma.taskTemplateItem.deleteMany({ where: { templateId: tpl.id } })
await prisma.taskTemplateItem.createMany({ data: items })
```

### Training module seeding pattern
Same pattern as templates — `upsert` the module, `deleteMany` + `createMany` for steps:

```typescript
await prisma.trainingModule.upsert({
  where: { id: m.id },
  update: { title, description, category, departmentId, linkedTaskId, ... },
  create: { id: m.id, title, description, category, venueId: venue.id, departmentId, ... },
})
await prisma.trainingStep.deleteMany({ where: { moduleId: m.id } })
await prisma.trainingStep.createMany({ data: steps })
```

### Removing a department
To remove a department from the seed, delete its `prisma.department.upsert()` block, its staff, its tasks, its QR codes, and its templates/training. Reassign staff IDs or soft-delete them. Update the console output at the bottom of `main()`.

### Console output
Always end `main()` with a clear login summary:
```typescript
console.log('Seed complete.')
console.log('Admin/manager web logins (email / password):')
console.log('  user@demo.com / password    (ROLE)')
console.log('')
console.log('Staff PIN logins:')
console.log('  1234 (First Last - DEPT TYPE)')
```

## DOS-MODERN DESIGN SYSTEM

The app uses a custom dark-mode monospace aesthetic. All new UI should follow these
established patterns from the budget module (the most complete reference implementation).

### Color tokens (from Tailwind config)

| Token | Hex | Usage |
|-------|-----|-------|
| `grey-dark` | `#1A1A1A` | Card backgrounds, input backgrounds |
| `grey-mid` | `#2E2E2E` | Borders, dividers |
| `grey-light` | `#6B6B6B` | Labels, muted text, placeholders |
| `accent` | `#E8E8E8` | Hover states |
| `success` | `#4ADE80` | Confirmation, 100% bars, zero variance |
| `danger` | `#F87171` | Errors, over-budget, over-100% |
| `white` | `#FFFFFF` | Primary text, active states |
| `black` | `#000000` | Page background, table backgrounds |

### Typography

```
Headings:   font-mono text-xl font-bold uppercase tracking-widest
Subheads:   font-mono text-xs uppercase text-grey-light tracking-wider
Body:       font-mono text-xs text-white
Labels:     font-mono text-xs uppercase text-grey-light
Numbers:    font-mono text-lg text-white (stats) / font-mono text-xs text-white (inputs)
Messages:   font-mono text-xs text-success (positive) / text-danger (negative)
Placeholder: font-mono text-xs text-grey-light (or font-sans for note fields)
Buttons:    font-mono font-semibold uppercase tracking-wider
```

### Input fields

```
Base:       bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none
Focus:      focus:border-white
Disabled:   disabled:opacity-40
Number:     text-right (for alignment)
Placeholder: placeholder:text-grey-light
Select:     Matches inputs — use className overrides for font-mono text-xs px-2 py-1.5
Active:     border-[#60A5FA] (blue border) when a non-default value is selected — indicates an active filter
```

### Button variants (from `@/components/ui/Button`)

| Variant | Classes | Use |
|---------|---------|-----|
| `primary` | `bg-white text-black border border-white` | Main action (GENERATE GRID, SAVE) |
| `ghost` | `bg-transparent text-white border border-grey-mid hover:border-white` | Secondary action (SAVE, + ADD, ↻ SYNC) |
| `danger` | `bg-transparent text-danger border border-danger hover:bg-danger hover:text-black` | Destructive (DELETE, ✕) |

Sizes: `sm` (text-xs px-3 py-1.5), `md` (text-sm px-4 py-2 — default), `lg` (text-base px-6 py-3)

### Unsaved-changes guard (#47)

`components/ui/Modal` (and `Drawer`) accept `dirty?: boolean`. When true,
backdrop click, Escape and `[ESC]` open a themed `DISCARD CHANGES?` confirm
(`DISCARD` / `KEEP EDITING`) instead of closing; only DISCARD calls `onClose`.
Explicit `CANCEL`/`CLOSE` buttons still call `onClose` directly (two-click
cancel is worse UX). Body scroll lock is reference-counted so a nested confirm
never unlocks the page under an open modal.

Editors opt in with `lib/use-dirty.ts`:
- `useDirty(value, { enabled })` → `{ dirty, markClean }`. Pass
  `enabled: !loading` so the baseline is captured with the loaded values (an
  async load never looks dirty); call `markClean()` after a successful save.
- `useBeforeUnload(dirty)` prompts on browser refresh/close.

Wired so far: `StaffEditModal`, `TaskEditModal`, `MenuItemDetailsModal`,
`CalendarEventFormModal`. Bespoke `fixed inset-0` editors do not use the shared
primitive; wire them (or migrate them to `Modal`) with the same pattern. Read-only
pickers/previews must not set `dirty`.

### Layout patterns

**2-column dashboard** — use for setup/configuration pages:
```
<div className="border border-grey-mid p-4">
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <div>LEFT COLUMN</div>
    <div>RIGHT COLUMN</div>
  </div>
</div>
```

**Section boxes:**
```
<div className="border border-grey-mid p-4 space-y-4">
  <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SECTION NAME</h3>
  ...content...
</div>
```

**Summary stats** — 3-column mini-grid inside a bordered box:
```
<div className="border border-grey-mid p-3 space-y-3">
  <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SUMMARY</h3>
  <div className="grid grid-cols-3 gap-3">
    <div>
      <div className="font-mono text-xs uppercase text-grey-light mb-0.5">LABEL</div>
      <div className="font-mono text-sm text-white">VALUE</div>
    </div>
    ...
  </div>
</div>
```

Variance color: `text-success` when 0, `text-[#FACC15]` when non-zero.

**Bottom action bar:**
```
<div className="border-t border-grey-mid pt-3 flex items-center gap-2 flex-wrap">
  buttons...
</div>
```

**Indented hierarchy** — nested items under a parent:
```
<div className="border-l border-grey-mid ml-2 pl-4 space-y-2">
  nested content...
</div>
```

**Progress bars:**
```
<div className="flex-1 h-2 bg-grey-dark border border-grey-mid">
  <div className="h-full bg-success" style={{ width: `${pct}%` }} />
</div>
```

Use `bg-success` when at/under target, `bg-danger` when over.

**Week card grid:**
```
<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
  <div className="border border-grey-mid">
    <div className="px-3 py-1.5 bg-grey-dark/30 border-b border-grey-mid">
      HEADER
    </div>
    <div className="divide-y divide-grey-mid">
      rows...
    </div>
  </div>
</div>
```

### Dual-variant navigation

For drill-down pages: `variant="grid"` (landing) and `variant="compact"` (detail page).
Grid variant shows a full selector; compact variant shows a slim bar with back/forward + "VIEW ALL" button.

### Auto-default behavior

- When a selector has data but nothing selected → auto-select first item
- When a form has no data → pre-fill with sensible defaults (e.g. REVENUE at 100%)
- Single-item lists → hide remove button (prevent empty state)
- New records → generate `crypto.randomUUID()` for IDs (never empty strings)

### State lifting

Stats that can be edited in a child component should be computed in the parent and passed down:
```
Parent:  const stats = computeFrom(allocationsState)
         <Child stats={stats} onEdit={updateAllocations} />
Child:   <input onChange={(e) => onEdit(e.target.value)} />
         <div>{stats.target}</div>
```

### API patterns

- All routes: session check → venue scoping (MANAGER locked to venue, ADMIN can select) → soft-delete filter (`deletedAt: null`) → return
- Category IDs: frontend sends `crypto.randomUUID()`, API uses `upsert` with `where: { id }`, never `update` on potentially-new records
- Sanitise sentinel values before DB: `'__venue__'` and `''` → `null` for nullable FK fields
- Auto-copy defaults: when requested resource doesn't exist, find most recent match with `some` filter → return as `defaults`
- Bulk operations: wrap in `prisma.$transaction(async (tx) => { ... })`

## ERP & WOOCOMMERCE (BUILT 2026-07)

> **WOOCOMMERCE FROZEN — Phase 0 of #60 (2026-11).** The integration is dormant:
> nothing in the running app pushes to or pulls from a store. Removed/deleted in
> Phase 0: the Woo webhook, cron sync routes, plugin connect, `/api/admin/sync`,
> `/admin/settings?tab=sync`, `/api/admin/settings/woocommerce`,
> `/api/admin/woocommerce/categories`, the Woo settings block, all `push*` /
> `ensureWooCategory` / `renameWooCategory` / `syncMenuItemCategory` calls, and the
> background product/order pull jobs (the daily expiry scan still runs). Gift-card
> Woo-order/product routes remain but **no UI calls them**. The `lib/woo-*.ts`
> files, their tests, and every Woo model/column/enum are intentionally kept
> (**no schema change**) for a future re-integration; treat the sections below as
> historical design notes, not current behaviour. Local menus, products, sizes
> (`MenuItem.variations`), orders (`WooOrder` as the local order store), gift
> cards, SwiftPOS and `ApiKey` public routes are unaffected.

### Schema: 162 models (as of 2026-11)
Core ERP models: `Supplier`, `UnitOfMeasure`, `SupplierItemCode`, `Recipe`,
`RecipeLineItem` (recursive BOM), `IngredientReference` (Pantry Bible),
`WooIntegration`, `MenuItem` (+ `MenuItemServe`, `MenuItemVenue`), `Menu`,
`MenuGroup`, `MenuMenuItem`, `OrderView`, `Customer`, `WooOrder`, `WooOrderItem`,
`SyncLog`, `ApiKey`. Later additions (gift cards, tips, events/BEO, availability/
roster/payroll, food safety, services) each have their own sections below.
`@@unique([venueId])` on WooIntegration.

### Orders Rework — Phase 1: data foundation (built 2026-07)

Groundwork for the orders overhaul. No UI change yet; Phases 2–5 build on this.

**`Customer` model** — one row per real person, per venue. Replaces the old
approach of deriving customers by grouping `Booking` rows at request time, so
the same person arriving via WooCommerce, phone, and the booking form becomes
one record instead of three. Carries normalised match keys (`emailKey`
lowercased, `phoneKey` digits-only with the NZ country code folded to national
format). `@@unique([venueId, emailKey])` makes a duplicate email impossible at
the DB level; phone is indexed but **not** unique, because households
legitimately share a landline.

**`lib/customer-match.ts`** — the matching rules, as pure functions
(`normaliseEmail`, `normalisePhone`, `buildCustomerKeys`, `findMatch`,
`fieldsToEnrich`) plus a `resolveCustomer` find-or-create that takes a
duck-typed client so it is testable without Prisma. Precedence is email → phone
→ name, and **name is only consulted when the incoming contact has neither an
email nor a phone** — otherwise one "JOHN SMITH" swallows every other John
Smith. A match enriches blank fields only; it never overwrites contact details
already held. 27 Vitest tests.

**`WooOrder`** — `wooOrderId` is now **nullable** (manual orders have none) with
`source` (WOO / MANUAL / PHONE) and `orderNumber` for local references.
Service scheduling moves to `serviceDate` (@db.Date) + `serviceTime` ("HH:mm"),
superseding `fulfillmentDate`. Operational lifecycle is deliberately **separate**
from `status` (which mirrors WooCommerce and is payment/store-centric):
`opStatus` (`OrderOpStatus`), `paymentStatus`, `paymentMethod`, and the
`paidAt` / `arrivedAt` / `deliveredAt` / `finalisedAt` stamps. Also `customerId`,
`fulfillmentType`, and `@@unique([venueId, orderNumber])`.

**`WooOrderItem`** — `notes` previously held **either** the Woo line-item name
**or** a JSON exploded-recipe blob. Those are now split into `productName` and
`explodedIngredients` (shape: `{ recipeId, recipeName, orderQty, ingredients[] }`),
freeing `notes` for genuine operator notes and adding `customerNote` +
`allergenNote` for per-line allergy requests. `/api/admin/inventory/reconcile`
reads the new column. `options Json?` (added in #118) snapshots the customer's
product-option choices for the line — see "Order option selection + drawdown".

**Backfill** — `packages/db/prisma/backfill-orders-phase1.ts`
(`npm run db:backfill-orders` in `packages/db`). Builds customers from existing
bookings + orders through the same matcher, splits the overloaded `notes`, and
copies `fulfillmentDate` → `serviceDate`/`serviceTime` using UTC parts so a
date-only value doesn't shift a day. Idempotent — clearing `notes` is the guard
— so it is safe to re-run and safe to wire into the deploy entrypoint later.
Payment fields are deliberately left at defaults rather than inferred from
order status; Phase 2 reads the real `date_paid` from WooCommerce.

### Orders Rework — Phase 2: field mapping + customer capture

**`WooIntegration.metaFieldMap Json?`** + `lib/woo-meta-map.ts`. Order date,
time slot, party size, allergy note and fulfillment type all arrive as custom
`meta_data`, and **the key depends on the plugin and the label the operator gave
the field** — Tyche's delivery-date plugin exposes its value under the
configured label, so a hardcoded key breaks on rename. Each field maps to an
ordered list of candidate keys; first present wins. Matching ignores case,
spaces, underscores and dashes. Edited under Settings → WooCommerce → ORDER
FIELD MAPPING; blank falls back to `DEFAULT_META_MAP`.

Parsers handle what stores actually emit: unix seconds *and* milliseconds,
ISO, **day-first** `15/08/2026` (not month-first), slot ranges collapsed to
their start (`"6:00 PM - 6:30 PM"` → `18:00`), and 12h/24h times. 30 tests.

**Payment** is mirrored from `date_paid_gmt` (not `date_paid` — the latter is
store-local with no offset and lands the stamp hours out) plus
`payment_method_title`.

**`opStatus` and `fulfillmentType` are never updated by a sync** — only set on
create. A staff member marking an order IN_PREP must not be reset by the next
webhook or 15-minute pull. Everything else (Woo status, totals, contact,
service date/time, payment) does update.

**Customers are resolved on every sync** via `resolveCustomer`, so the same
person ordering online, by phone, and through the booking form is one record.
`pushOrderStatus` no-ops for non-WOO orders — pushing a local order would PUT to
`orders/null` and log a failure on every status change.

### Orders Rework — Phase 3: menus + min/max

`Menu` (venue-scoped, `@@unique([venueId, name])`) + `MenuMenuItem` junction.
Two independent rule levels, both of which real catering menus use:
- **menu level** — `minPax`/`maxPax`, the headcount range the menu is offered for
- **item level** — `minQty`/`maxQty`, limits on an item *if it is ordered*
  (skipped entirely on STOCK lines, which have no minimum)

`minQty` deliberately does **not** force an item onto every order — it is the
floor once you take any at all, otherwise an order that skips the item would be
impossible. Duplicate lines for the same item are summed before checking, so two
lines of 5 satisfy a minimum of 10.

`lib/menu-rules.ts` (`validateOrderAgainstMenu`, `menuAllowsPartySize`,
`describePaxRange`) is pure, so the same rules run in the browser for live
feedback and on the server where they actually hold. 19 tests. Admin UI at
`/admin/menus`.

### Orders Rework — Phase 4: the orders page

`/admin/orders` is now date-driven with four renderers over one payload, so
switching view costs no round-trip:

| View | Shows |
|---|---|
| SERVICE | Grouped by time slot, with covers per slot |
| KITCHEN | Allergy alerts first, then dish totals and a category rollup |
| FOH | Grouped by table (a multi-table order appears under each) |
| PRODUCTION | Flat pick list with tick boxes and allergen tags |

**`lib/order-views.ts`** holds every projection as a pure function
(`aggregateDishTotals`, `aggregateCategoryTotals`, `collectAllergenAlerts`,
`groupByTable`, `groupByTimeSlot`, `summarise`, `applyFilters`). 34 tests.

Two decisions worth keeping:
- `aggregateDishTotals` keys on **name, not id** — the same dish sold as two Woo
  products is still one thing to cook.
- `collectAllergenAlerts` surfaces **only customer-stated requirements**, never
  the dish's own allergen tags. Those are on every card already; mixing them in
  would bury the handful of real "severe nut allergy" instructions under dozens
  of routine GLUTEN tags.

**`OrderView` model** stores named filter/grouping presets per venue
(`viewType` fixed, everything bendable in `config` Json so new controls need no
migration). Private views are visible only to their creator.

**Manual orders** — `POST /api/admin/orders` creates local orders with a
sequential `M-0001` reference, validates against the chosen menu server-side
(422 with the violations), and dedupes the customer. `PATCH` handles the
operational lifecycle and auto-stamps `arrivedAt`/`deliveredAt`/`finalisedAt` on
first arrival at a state (never rewriting history when moving back and forth).
`PUT` replaces line items.

**Performance:** the old `GET /api/admin/orders` fetched every order ever with
no date filter, and the FOH route ran a `recipe.findUnique` **per line item**.
The route is now a fixed 4 queries regardless of order count. Orders with no
service date would be invisible on a date-driven page, so the response carries
`undatedCount` and the UI banners it as a field-mapping problem rather than
silently losing them.

### Orders Rework — Phase 5: booking ↔ order linking

`WooOrder.bookingId` + `lib/order-booking-link.ts`. A customer who books a table
and then pre-orders online produces two unconnected records; linking them puts
the order on the table the party is actually sitting at. When linked, the
booking's tables **take precedence** over any layout auto-generated for the
order.

Identity must match on customer record, email, or phone — **never name alone**,
since sending food to the wrong table is worse than leaving it unlinked.
Cancelled/no-show reservations are skipped. Where one person has several
bookings, the nearest in time wins. Runs on both manual creation and Woo sync,
best-effort, and only when not already linked so a manual correction sticks.
11 tests.

### Recipe Explosion Engine (`lib/inventory-engine.ts`)
Recursive BOM parser: walks `RecipeLineItem` tree, converts all quantities to base units via UOM conversion ratios, returns flattened `Map<inventoryItemId, requiredBaseQty>`. DAG-safe cycle detection via visited set. 5 Vitest tests with mocked PrismaClient.

### WooCommerce Webhook (REMOVED in Phase 0 — `/api/webhooks/woocommerce` deleted)
Receives `order.created` / `order.updated` AND `product.created` / `product.updated` / `product.deleted` (branched on `x-wc-webhook-topic`). HMAC-SHA256 signature auth. Echo guard: pushes stamp `_updated_by: hospo-ops` + `_hospo_ops_pushed_at`; `isSelfEcho()` (lib/woo-push.ts) skips webhooks arriving within 2 min of our own push — genuine later edits still sync. Orders: upserts `WooOrder` + `WooOrderItem` in transaction, runs `explodeRecipe` per line item, stores exploded ingredients as JSON on order items. Products: `upsertProductFromWoo()` / soft-delete on `product.deleted`. Auto-seating engine: greedy first-fit bin-packing on partySize → `CalendarEvent` → `FloorPlanSetup` → `SetupItem` → `TableGroup`. Every event logs to `SyncLog`.

### Two-Way Sync (built 2026-07, refined 2026-07)

> **Dormant since Phase 0 of #60 (2026-11).** The pull/push helpers below still
> exist and are unit-tested, but no live route, component, cron job or webhook
> calls them. Keep them for reference until the replacement integration is built.

**Pull (Woo → app):**
- `lib/woo-sync.ts` `runProductPull(venueId?)` — paginated product fetch, upserts `MenuItem`s, logs to `SyncLog`
- `upsertProductFromWoo()` stores category **IDs** (numeric, for reliable push-back), downloads featured images to local uploads (content-addressed filenames prevent re-download; skips images >2MB), and **decodes HTML entities** (`&amp;` → `&` etc.) from names and descriptions before storage to prevent double-encoding on push-back
- `fetchProductVariations()` pulls variation data (ID, name, price) from WooCommerce for variable products and stores them in the `variations` JSON field
- `fetchWooCategories()` fetches all product categories from the WooCommerce REST API — used by the category autocomplete dropdown in the admin UI
- `lib/woo-orders-sync.ts` `runOrderPull(venueId?)` — paginated order fetch, upserts `WooOrder` + `WooOrderItem`, runs recipe explosion, auto-seating, and gift card detection per order, logs to `SyncLog`

**Push (app → Woo):**
- `lib/woo-push.ts` — `pushProduct()` fires on every menu item / recipe menu-link save (name, price, category, and images → `PUT wc/v3/products/{id}`)
- **Auto-create on WooCommerce:** if the item has no `wooProductId` (new product) or the PUT returns 400/404 (product doesn't exist on Woo), `pushProduct()` POSTs to `wc/v3/products` to create it, then stores the returned WooCommerce product ID in the database
- **Images pushed:** `buildProductPushPayload` includes `images` when `imageUrl` is set; relative `/api/upload/...` paths are resolved to absolute URLs using `APP_URL` or `NEXTAUTH_URL`
- **Short description pushed:** `buildProductPushPayload` includes `short_description` when `shortDescription` is set
- **Variable products:** toggling VARIABLE PRODUCT in the recipe editor sets `isVariable: true` and stores variation names/prices in JSON. On push, `type: "variable"` and `attributes` are sent so WooCommerce creates a variable product with size options. **Variation prices are pushed back individually** via `PUT /products/{id}/variations/{varId}` for variations that have a `wooVariationId` (pulled from WooCommerce).
- **Category handling:** numeric `wooCategoryId` → `categories: [{ id }]`; non-numeric is omitted (category names are resolved to IDs in the UI dropdown before storage)
- **Other push helpers:** `pushOrderStatus` / `pushOrderPaid` / `pushOrderItems`, `opStatusToWooStatus`, `pushProductDisconnect` (recipe disconnect → store draft + uncategorised), `syncProductVariations`
- **Auth fallback chain** (`lib/woo-oauth.ts`, 7 tests): Basic → query-string creds → **OAuth 1.0a signed URL** (`oauthSignedUrl`) for hosts behind proxies where WordPress `is_ssl()` is false
- All pushes best-effort: log to `SyncLog`, never throw, never block the save

**WooCommerce plugin pairing** (`lib/woo-pairing.ts`, 6 tests): `POST /api/public/woocommerce/connect` stores minted WC keys, marks `WooIntegration.managedByPlugin` + `pairedAt`, and returns the webhook URL + a rotated `whsec_…` secret. Settings shows the connection read-only until **MANUAL OVERRIDE**; `DELETE` requires the current consumer key so a stale plugin can't wipe live creds.

**Auto-generated Woo Product ID:**
- When creating a menu item via POST (both `/api/admin/menu-items` and the recipe ITEM LINKS flow) without providing a `wooProductId`, the API queries `max(existing wooProductId) + 1` for the venue and auto-assigns it. This gives new products an ID to push with — the push then creates the product on WooCommerce if it doesn't exist yet.
- **Sync dashboard (REMOVED in Phase 0):** the `SYNC` settings tab, `/admin/sync`, `/api/admin/sync/*` and `SyncClient` were deleted. `SyncLog` rows remain in the database as historical data.

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/woocommerce/categories` | — | **REMOVED in Phase 0.** The category pickers are gone from recipes, menu items and the menu builder. |
| `/api/admin/orders` | GET, POST | Orders for a service date (4 fixed queries, all four views) / create a manual order |
| `/api/admin/orders/[id]` | PATCH, PUT, DELETE | Lifecycle + fields / replace line items / soft-delete |
| `/api/admin/menus` | GET, POST | List/create menus |
| `/api/admin/menus/[id]` | GET, PUT, DELETE | Menu CRUD; PUT diffs the item set |
| `/api/admin/order-views` | GET, POST | Saved order-page views |
| `/api/admin/order-views/[id]` | PUT, DELETE | Saved view CRUD |

### Internal Cron Scheduler (`instrumentation.ts` + `lib/internal-cron.ts`)
Started once on server boot via Next's `instrumentationHook` (enabled in next.config.mjs). Minute tick; pure `dueJobs(state, now, tz)` decides what fires (Vitest-covered). Job: expiry scan daily 03:00 in `DEFAULT_TIMEZONE` (`runExpiryScan` in `lib/expiry-scan.ts`) and the guest-parking health check daily 05:00 (`runParkingHealthChecks` in `lib/parking-health.server.ts`, enabled venues only; READINESS GET-only by default). The Woo product/order pull jobs were removed in Phase 0. Fully self-contained — no host crontab. Disable with `INTERNAL_CRON=false`. Dev hot-reload guarded via `globalThis.__hospoInternalCron`.

### Cron Endpoints (`/api/cron/`) — external scheduler fallback
- `expiry-scan`: thin wrapper over `runExpiryScan()` — sweeps expired `InventoryItem`s, traces BOM to parent products, applies `fallbackCategoryId`
- All authenticated via `Authorization: Bearer <CRON_SECRET>` header
- `woocommerce-sync` / `woocommerce-orders-sync` were deleted in Phase 0.

### Menus, serves & COGS (built 2026-08/09)

**Product serves** — `MenuItemServe` + `ServeMethod` (`MADE | DRAUGHT |
POURED | BOTTLED | WINE | OTHER`) is the product's POS/reporting spec: exactly
one target (`recipeId` XOR `inventoryItemId`), `qty` + `uomId`, label ("400ML").
Serves live on the **product**, not per menu, because SwiftPOS sales attribute
to the product. `lib/menu-serves.ts` (10 tests) validates one target / qty > 0 /
unit-kind consistency; `/api/admin/menu-items/[id]/serves` GET/PUT (PUT replaces
the set). Editor `MenuItemServesEditor` inside ITEM LINKS.

**Product option groups (Phase 2 of #71, built 2026-11)** — `MenuItemOptionGroup`
→ `MenuItemOptionChoice` (name, `minSelect`/`maxSelect`, `priceDelta`,
`isDefault`, sortOrder, soft delete) model customer choices shared across every
menu the product is on ("SIDE: FRIES / SALAD / FRIES + SALAD +$3"). Upcharges
are additive only. `lib/menu-options.ts` (pure) owns
`normaliseOptionGroups` / `validateOptionGroups` (`min <= max`, `max <= choices`,
one default when single-select) and display helpers (`describeOptionGroup`,
`formatPriceDelta`, `summariseOptionChoices`). `GET/PUT
/api/admin/menu-items/[id]/options` (view/edit, MANAGER venue-locked); PUT is a
replace-set that soft-deletes removed rows and **revives a returning row by its
unique key**. `MenuItemOptionsEditor` opens from a product menu line's
**OPTIONS** button; options ride on `ShapedMenuLine.options` and render in
`MenuLineEditor` + `MenuPreview`. The PDF import maps parsed options onto these
rows (Phase 3, below).

**Order option selection + drawdown (#118, built 2026-11)** — an order line can
now record the customer's choices and price them. `WooOrderItem.options` is an
**additive `Json?` snapshot**: `[{ groupId, groupName, choiceId, choiceName,
priceDelta }]` (a snapshot, not a join, so editing a choice later never rewrites
order history). `MenuItemOptionChoice` gained additive
`inventoryItemId?`/`qty?`/`uomId?` (mirroring `MenuItemServe`) for an optional
stock drawdown per choice. **These drawdown fields have no authoring UI yet** —
they are phase-2 plumbing so the reconcile path can compute what #116 will post;
editing them on a choice is a follow-up. `lib/order-options.ts` is the pure,
Prisma-free brain:
`normaliseOrderOptions`, `describeOrderLineOptions`, `optionPriceDelta`,
`toggleOptionSelection`, `sortOrderOptions` and `validateOptionSelection`
(unknown group/choice, `minSelect`/`maxSelect`, single-select cap, and one
default are enforced; the resolved snapshot uses the **live** group/choice
ids + `priceDelta`, not the submitted ones; the one-default rule only applies to
single-select groups, so an untouched multi-select group cannot 422).
`lib/order-options.server.ts`
`loadOptionGroupsForItems` loads the live groups (own **and** shared/venue
products) and their list prices in two queries.

`POST /api/admin/orders` and `PUT /api/admin/orders/[id]` accept `options` per
line, re-validate server-side and return **422** `{ error, violations:
[{ lineIndex, … }] }` on a bad selection. On a line that supplies `options`,
the submitted `unitPrice` is the **base** product price and the server folds
the live `priceDelta` into the stored `unitPrice` and line total. A null
`unitPrice` falls back to the product's `MenuItem.price` (never just the
upcharge). A line that
**omits** `options` keeps its stored snapshot and final price untouched, so
editing one line never rewrites an untouched legacy line. The GET payload
projects both `options` (snapshot) and `optionGroups` (live, for the drawer's
picker). The UI uses `OrderOptionPicker` in `NewOrderModal` (new lines, defaults
pre-selected) and `OrderDetailDrawer` (edit a line's choices via PUT; sends the
base = stored price − old upcharges, or the product price when the stored price
is null). `NewOrderModal` reads the **shaped** menu lines returned by
`/api/admin/menus` (`menuItemId`/`name`/`price`/`options`, no nested `menuItem`),
so the picker works for both the free-item and menu paths.
KITCHEN/FOH/PRODUCTION show the choices per line (`DishTotal.optionBreakdown`)
while `aggregateDishTotals` still keys on product **name**, and the
allergen-alert logic is unchanged.

`lib/order-drawdown.ts` is the pure drawdown merge: a base `explodeRecipe` map
**plus** each selected choice's drawdown via `mergeDrawdown`, gram-aware through
`canonicalQty` (same rule as the recipe explosion); an unmapped choice is a
no-op. `lib/order-drawdown.server.ts` `loadChoiceDrawdowns` resolves the live
choice rows, and `POST /api/admin/inventory/reconcile` now consumes it — this
only **computes** the implied stock; nothing writes a count or posts a deduction
(that is #116).

**Deploy note:** additive only. `prisma db push` creates `WooOrderItem.options`
and the three `MenuItemOptionChoice` columns/indexes; no data migration or
backfill is required.

**Menu builder** — `/admin/ops?tab=menu&sub=menus` (`MenusClient` +
`MenuBuilder` / `MenuLineEditor` / `MenuPreview`): local menus with groups +
drag-reorder lines, product **and stock** lines (polymorphic `MenuMenuItem`:
`menuItemId` XOR `inventoryItemId`), per-line min/max, stock `sizeOptions`, live
plain-text preview. **Since Phase 0 of #60 a menu is purely local** — no Woo
category is created, looked up or re-synced (the deployed DB may still carry
legacy `Menu.wooCategoryId` values). `lib/menu-lines(.server).ts` (9 tests) is
the single read shape (`shapeMenuLine`; purged targets render REMOVED).
`lib/menu-sync.ts` (9 tests) remains dormant.

**Menu import from a PDF (#49; Phase 1 of #71 — contract, editable preview &
idempotency, 2026-11)** — `⬆ IMPORT MENU` on `/admin/ops?tab=menu&sub=menus`
opens `MenuImportModal`. `lib/menu-import.ts` (pure) builds a copy-paste LLM
prompt (`buildMenuImportPrompt`) and tolerantly parses the pasted answer
(`parseMenuImportAnswer` — plain/fenced/prose-wrapped JSON, `$16.50` → `16.5`).
Each item carries `name`, `price`, `description`, optional `sizes`
(`[{ label, price }]`) and optional `options`
(`[{ name, required, min, max, choices: [{ name, priceDelta }] }]`); groups carry
`name` + `area`, and a **flat** answer may put `group`/`area` on each item instead.
Names are normalised (trimmed, whitespace collapsed, uppercased) and one product
is kept per normalised name. The parser returns **structured issues** (missing
price/description/size price/group, duplicates) plus `MATCH` / `NEW` / `AMBIGUOUS`
via `matchImportItems`. **Dietary is no longer imported** — allergens come from
the product/recipe; new products start blank and the preview/summary show
`DIETARY NOT IMPORTED`. **Options are imported** (Phase 3): each parsed group
is sanitised/validated with `lib/menu-options.ts`, new products get every valid
group + choice, and matched products are **additive upsert by name** — missing
groups/choices are created, soft-deleted rows are revived, and curated rows are
never overwritten or removed. Invalid groups are skipped and reported in the
summary (`optionGroupsAdded / optionChoicesAdded / optionsSkipped`). The preview is editable
through draft helpers (`createImportDraft`, `renameImportGroup`,
`renameImportItem`, `moveImportGroup`, `moveImportItem`, `reorderImportItem`,
`draftToImportData`) with stable draft ids, so selection survives rename/move/
reorder. `POST /api/admin/menus/import` (guard `ops.menus.create`) re-validates
server-side and, in one transaction, matches products by normalised name
(reporting `AMBIGUOUS` and skipping instead of guessing), creates missing products
with `sizes` → `MenuItem.variations` (`isVariable: true`), **upserts the
`(menuId, menuItemId)` line** so a re-import re-files/reorders instead of
duplicating, and revives a soft-deleted menu. Options are written to
`MenuItemOptionGroup` / `MenuItemOptionChoice` (additive for matched products,
never duplicate on re-import). It never writes `dietaryInfo`, never calls
`pushProduct` (`wooProductId` stays null) and returns a summary
(`created / matched / linesAdded / linesUpdated / skipped / optionGroupsAdded /
optionChoicesAdded / optionsSkipped / warnings`). New products are `recipeId:
null` and appear in **INVENTORY → MENU ITEMS**, where a recipe can be attached
or a serve/stock drawdown added later.
The demo seed also creates `FISH & CHIPS` with a required `SIDE` option group
(`FRIES / SALAD / FRIES + SALAD +$3.00`) using fixed `00da…` demo UUIDs.

**Shared import framework (#89, built 2026-11).** A generic copy-paste-LLM →
preview → commit path lives in `lib/import/` and is being rolled out to products,
recipes, tasks and guides. `types.ts` defines the row/action/match contract
(`CREATE | UPDATE | REVIVE | SKIP`, `NEW | MATCH | AMBIGUOUS |
DUPLICATE_IN_FILE | SIMILAR`); `similarity.ts` normalises names and flags
near-copies via token Jaccard + Levenshtein; `framework.ts` owns
include/action/summary plus `patchRowValues` (per-row value edits).

`ImportModal` is the shared three-step UI (prompt copy/download, paste or load a
`.md`/`.json` file, then an editable preview). It is generic (`ImportModal<T>`)
and takes `endpoint`, an optional `renderSummary` (default = name + `$price`,
which keeps the MENU_ITEM row byte-for-byte), an optional `renderRowControls`
for per-row toggles, and an optional `fields` list (`ImportField<T>[]`) that
renders an **EDIT** panel per row for inline correction of scalar values
(name/title, price, yield, description, department/section/checklist names, …)
**before** importing. Collections (recipe lines, guide steps, options) are not
inline-edited; they use the explicit `REPLACE LINES` / `REPLACE STEPS` gates.

**MENU_ITEM adapter (PR 1)** — `lib/import/menu-item.ts` reuses
`parseMenuImportAnswer` (a flat `{ products: [...] }` answer is wrapped into the
existing menu shape), flattens it and matches existing products.
`GET/POST /api/admin/import/menu-items` (guards `ops.menus.view` / `.create`,
MANAGER venue-locked) lists products and applies rows: CREATE makes a local
`recipeId: null` product (sizes → `variations`), UPDATE/REVIVE patch by id,
options are additive. Nothing is deleted or pushed to Woo.

**RECIPE adapter (PR 2, built 2026-11)** — `lib/import/recipe.ts` (pure) builds
the LLM prompt and parses name / `yieldQty` / `yieldUnit` / `prepTime` /
`instructions` / `lines`. A line targets `ITEM` (InventoryItem), `RECIPE`
(sub-recipe) or `PANTRY` (IngredientReference) **by name**, with `qty` and `uom`
by name. `matchRecipeRows` gives exact/ambiguous/similar matching;
`resolveRecipeImportRefs` maps every name against the venue's items, recipes,
UOMs and Pantry entries and calls the shared pure `unitKindMismatch` (same
VOLUME/MASS/COUNT + density-bridge rule as `checkRecipeLineUnits`). An unknown
target or unit is a row **ERROR** and defaults the row to SKIP — it is never
invented. `GET/POST /api/admin/import/recipes` (guards `ops.recipes.view`,
`ops.recipes.create`, plus `ops.recipes.edit` when any row is UPDATE/REVIVE;
MAX 400 rows; MANAGER venue-locked) re-validates every name/id against the venue
and applies the rows in one `$transaction`. CREATE checks the name and skips a
duplicate; UPDATE/REVIVE patch the scalars; **`REPLACE LINES` is an explicit
per-row tick, default OFF** — because `RecipeLineItem` has no `deletedAt`,
replacing lines is `deleteMany` + recreate and only happens when ticked.
Recipes are prep/BOM only: nothing creates a `MenuItem` or pushes to Woo. Entry
point: `⬆ IMPORT` on `/admin/ops?tab=inventory&sub=recipes` (`RecipesClient`).

**TASK adapter (PR 3, built 2026-11)** — `lib/import/task.ts` (pure) parses
title / description (Markdown → sanitised HTML) / department / section /
checklist **by name** / completion type / schedule. DAY names (`MON`) and
numbers (0-6) are both accepted; WEEKLY with no days and MONTHLY without a valid
option are row ERRORs. `matchTaskRows` gives exact/ambiguous/similar matching;
`resolveTaskImportRefs` maps department/section/checklist names and defaults the
row to SKIP on an unknown name. `GET/POST /api/admin/import/tasks` (guards
`execution.tasks.view` / `.create`, plus `.edit` for UPDATE/REVIVE; MANAGER
venue-locked) resolves the same names server-side. **Every imported task is
created `status: DRAFT`** (UPDATE preserves the existing status; REVIVE returns
to DRAFT) and the optional checklist name links it via `ChecklistTask`.

**GUIDE adapter (PR 3, built 2026-11)** — `lib/import/guide.ts` (pure) accepts
either the JSON prompt or a **Markdown document** (`lib/import/markdown.ts`:
H1 → title, H2 → steps, paragraphs/lists → sanitised HTML). Parse title /
description / category / guideType / body / folder / audiences / tracked /
sign-off / steps (heading, content, video) / step links. Audiences
(DEPARTMENT/SECTION/POSITION) and links (ITEM/TASK/CHECKLIST/GUIDE/SECTION/
RECIPE) are referenced **by name**; unknown names are row ERRORs. A guide with no
resolved audience gets a loud **`NOBODY WILL SEE THIS`** warning (still DRAFT).
`GET/POST /api/admin/import/guides` (guards `training.playbook.view` /
`.create`, plus `.edit` for UPDATE/REVIVE; MANAGER venue-locked) re-validates
names, creates a missing folder by name, and writes DRAFT guides. UPDATE
replaces audiences; **`REPLACE STEPS` is an explicit per-row tick, default
OFF** (deleteMany + recreate only when ticked). PRODUCT_REFERENCE guides are
rejected here. Entry points: `⬆ IMPORT` on `/admin/execution?tab=tasks`
(`TasksClient`) and `/admin/training?tab=playbook` (`GuidesClient`).

**COGS** — `lib/menu-cogs.ts` (8 tests, pure): `costPrice` is per ONE stock
`unit`; `costExploded` converts to grams via the density bridge;
`lib/menu-cogs.server.ts` `cogsForMenuItems(ids)` is lazy + batched, and marks
`partial: true` (UI renders `~`) when an ingredient has no cost. Shown per menu
row via `POST /api/admin/menus/cogs` and in `MenuLineEditor` vs ex-GST price
(`priceExGst`, `grossMarginPct`).

**Product sizes** — local price points stored on `MenuItem.variations`
(`PUT /api/admin/menu-items/[id]/sizes` merges by name). Since Phase 0 they are
**not** pushed to Woo as variations.

### Gift cards (built 2026-08/09)

Physical-card workflow: `GiftCard` rows (`YYYY####` numbers via
`lib/gift-card-numbers.ts`, 10 tests) are **premades** — `DRAFT` rows waiting to
be issued. Issue consumes the lowest DRAFT (atomic `updateMany` claim so two
issuers never share a number) and renders a PDF; RESET returns the card to blank
DRAFT keeping its number + history; REPLACE voids the old card and issues a new
number in one transaction (`replacesId` chain, `history` keeps everything,
200-event cap — `lib/gift-card-history.ts`).

**PDF templates** — `GiftCardTemplate` stores an uploaded **AcroForm PDF** (≤25MB,
≥1 form field) + `fieldMapping Json` (`{pdfField, dataKey, format?}`).
`lib/gift-card-template.ts` (16 tests, pdf-lib) proposes the mapping from field
names, fills and **flattens** (print-safe), truncates over-long values. When no
template is active the built-in jsPDF fallback (`lib/gift-card-pdf.ts`) renders.
`lib/gift-card-issue.ts` is the one PDF path shared by admin issue / bulk /
Woo auto-issue / public fetch.

**WooCommerce orders** — detection is by the venue's gift-card **category id**
(`lib/gift-cards-woo.ts`, 8 tests; legacy SKU "GIFT" heuristic as fallback).
Unpaid orders are never stored: `GET /api/admin/gift-cards/pending-orders`
fetches them live from the store, and CONFIRM PAYMENT pushes paid → pulls →
issues (Woo's REST can't write `date_paid`, so the app is the authority for cash
confirmations). `lib/woo-orders-sync.ts` auto-issues for paid gift orders on
sync (one combined card per order; payment-gated). The WP plugin pulls issued
PDFs at `GET /api/public/orders/[wooOrderId]/gift-card-pdf` (Bearer `ApiKey`) —
a successful fetch marks cards SENT.

**Admin UI** `/admin/gift-cards` (`GiftCardsClient`, CARDS + GIFT ORDERS tabs):
issue popup with template picker + live preview, pending-payment orders,
template manager (mapping editor + preview), Woo category link + variable
product editor (denominations), bulk print (≤500, merged PDF), email send
(nodemailer; **SMTP creds come from the request body**, not env), redeem /
replace / void / reset / delete (voided only). Guards:
`performance.giftcards.view|issue|redeem`.

**Worker issue** — `/w/giftcards` (`WorkerGiftCardsClient`) for floor staff with
`performance.giftcards.issue` (`lib/worker-gift-access.ts`) — issue next premade
+ print. The dashboard exposes a **GIFT CARDS** tile only when
`GET /api/worker/giftcards/access` allows it, and the client issues via
`POST /api/worker/giftcards` (the old dead `/issue` URL was fixed in #73).

**Lookup, balance, redemption & reuse (#110, built 2026-11).** `GiftCard` gains
**`redeemedAmount Float @default(0)`** and **`redeemedAt DateTime?`** (additive —
`db push`). The spendable value is `amount - redeemedAmount`. Partial
redemptions are supported; the card stays `ISSUED`/`SENT` until the balance hits
zero, then becomes `REDEEMED` and stamps `redeemedAt`. Each redemption appends a
`REDEEMED` event (including who did it) to the existing `history` JSON in the
same write — never rewritten, never hard-deleted. The write is an optimistic
CONDITIONAL `updateMany` on `status IN (ISSUED, SENT)` + the read
`redeemedAmount`; a lost race returns 409 rather than double-spending. A card
past `expiresAt` is stamped `EXPIRED` conditionally and cannot be redeemed.
Pure rules live in `lib/gift-card-redemption.ts` (`remainingBalance`,
`isCardExpired`, `validateRedemption`, `nextRedemptionState`); the server half
`lib/gift-card-redemption.server.ts` `redeemGiftCard()` is shared by the worker
and admin routes so both enforce the same venue-scoped rules. The phone detail
select (`lib/gift-card-select.ts`) never returns admin-private `notes`.

The worker app is now a phone-first workflow (`WorkerGiftCardsClient`): search
ANY card by number, customer name or email (case-insensitive, venue-scoped,
`deletedAt: null`), open it for number / amount / remaining balance / status /
issued & expiry dates / customer / message / full history, then redeem part or
all of the balance with thumb-sized controls. The same page sells a card and can
**PICK a specific DRAFT** (or take the next number), and managers/admins can
**RESET a card to a blank DRAFT with the SAME number and full history** (reuse;
the shared `resetGiftCardToDraft()` also backs the admin reset route, and is an
optimistic conditional write like redemption). A restricted manager needs the
`performance.giftcards.redeem` grant; an unrestricted manager keeps legacy full
access and ADMIN bypasses. The page uses `pb-28` so its actions clear the worker
bottom bar.

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/worker/giftcards` | GET, POST | GET with no query = module state; `?search=` / `?status=` / `?list=1` = venue-scoped lookup. POST accepts `cardId` to issue that specific DRAFT (else the next premade) |
| `/api/worker/giftcards/[id]` | GET | Full card + `balance` for the phone detail view |
| `/api/worker/giftcards/[id]/redeem` | POST | Redeem part or all (`{ amount }`); 400/409 on invalid/over-balance/void/expired |
| `/api/worker/giftcards/[id]/reset` | POST | Managers/admins only (restricted manager needs `performance.giftcards.redeem`) — reset to DRAFT for reuse, same number, history kept |
| `/api/admin/gift-cards/[id]/redeem` | POST | Same partial/full redemption from the admin card popup |

The admin gift-card popup shows the remaining balance and a redeem amount
(blank = full balance). `resetGiftCardToDraft()` also clears the new redemption
fields so a reused card starts clean.

**In-app PDFs (`PdfDocumentView` + `PdfActionBar`).** Every gift-card PDF opens
*inside* the app — worker issued card (`GiftCardPdfView`, which calls
`useWorkerImmersive(true)`), the admin card popup, the admin template PREVIEW and
the template live preview. `components/ui/PdfDocumentView` stacks
`PdfCanvasViewer` over `PdfActionBar`, whose bottom bar is the only way out:
**BACK** (shown whenever `onBack` is passed, and always in a standalone/PWA),
**PRINT** (a hidden same-origin iframe with `?inline=1`), **SHARE** (Web Share
API level 2 with the actual PDF `File`, prefetched so iOS keeps the user
gesture; `canShareFiles()` hides the button when unsupported), **DOWNLOAD** and
**OPEN**. `showOpen` / `showDownload` (default `true`) gate the last two buttons;
the worker gift-card PDF passes both `false` so it stays in the app, while admin
gift-card surfaces keep the full bar. The pure, testable helpers live in `lib/pdf-actions.ts`
(`sanitisePdfFilename`, `canShareFiles`, `sharePdfFile`, `printPdfUrl`,
`downloadPdfUrl`, `isStandaloneApp`). On phones the viewer also pinch-zooms and
double-taps between fit and 2× (`lib/pdf-zoom.ts`; one-finger scrolling stays
native), and the action bar uses 44px buttons (`min-h-11`) with safe-area
padding so the controls clear the home indicator. **Rule:** never `window.open` a PDF a
worker must return from; any full-screen document/webpage view needs a back
affordance. PDF routes accept `?inline=1` for the viewer/print iframe (default
stays `attachment`); bulk card printing remains a direct download, which is the
right action for a stack.

### Tips (built 2026-09)
`TipsPeriod` (`fromDate`/`toDate`, `cashCounts Json`, `posTotal`,
`shares Json`, `notes`) + `lib/tips.ts` (tested) allocate pooled tips across
staff. `/admin/tips` (`TipsClient`) creates periods, enters cash/pos totals and
shares, and shows each person's accrued amount. Seeded with one mock period.

### Public API + API keys (built 2026-09)
`ApiKey` (venue-scoped, `keyHash` sha256, `lastUsedAt`; raw `ho_…` shown once)
via `lib/public-api.ts` `venueFromApiKey` (Bearer or `x-hospo-api-key`).
Admin management at `/api/admin/api-keys(+/[id])`, UI in Settings → GENERAL →
EXTERNAL API. Key-authenticated public routes: `/api/public/config`,
`/api/public/availability`, `/api/public/bookings`,
`/api/public/woocommerce/connect`, `/api/public/orders/[wooOrderId]/gift-card-pdf`.
Event share links use separate hashed tokens (`/e/[token]`), not API keys.

### Files, media & image annotations (built 2026-09/10)
One storage root (`UPLOAD_PATH`; `lib/storage.ts` `storageDir` + traversal
guard) — server code must never write `public/uploads`. `sharp` compresses
images on intake (`upload-image.server.ts`), `ffmpeg` transcodes phone videos
(`video-transcode.ts`, 2 tests; 200MB cap). `GET /api/upload/[filename]?w=`
serves files + cached `.thumbs` (`lib/image-thumb.ts`, 4 tests).
**File usage** (`lib/file-usage.ts`) maps a file basename to the records that
reference it; the ADMIN-only **Settings → FILES** tab (`FileBrowser`,
`/api/admin/files(+/download|/usage)`) browses/deletes, refusing to delete
files still in use. `MediaLibraryModal` reuses existing uploads.

**Image annotations** — `ImageAnnotation` (`usageKey` + `imageUrl` + `data Json`,
`@@unique([usageKey, imageUrl])`) stores non-destructive vector layers
(0–1 coordinates, arrows/text/shapes) drawn over any uploaded image.
`lib/image-annotations.ts` (24 tests, pure) has the geometry + hit-testing +
`normaliseAnnotation` sanitiser; `ImageAnnotator` edits (ADMIN-only write),
`AnnotatedImage` renders read-only everywhere (worker reader, guide PDF).
Usage keys: `guide-step:<id>`, `guide-row:<id>:<col>`, `menu-item:<id>`,
`inventory-item:<id>`. Routes: `/api/admin/image-annotations` GET/PUT (PUT with
empty data soft-deletes the layer).

### Release update verification (#76, built 2026-11)
An ADMIN-only **Settings → UPDATES** tab (no sidebar entry) is the
"verify every shipped change in production" worklist. Content is the committed
GitHub snapshot `apps/web/content/release-updates.json`, so production never
calls GitHub and no token is needed.

- **Snapshot** — `scripts/sync-github-updates.mjs` (`npm run sync:updates`)
  runs `gh issue list --state all --limit 500 --json
  number,title,state,labels,url,closedAt`, writes the snapshot with
  `version` from `apps/web/version.json` (fallback: timestamp) plus
  `generatedAt`/`repo`. Review the JSON diff in the PR before shipping; the page
  shows `RELEASE <version>` + `GENERATED <date>`.
- **State** — `UpdateConfirmation` (global, no `venueId`): `version`,
  `issueNumber`, `staffId`, `confirmedAt`, optional `note`, soft delete,
  `@@unique([version, issueNumber, staffId])`, index `(staffId, version)` +
  `Staff.updateConfirmations`. Per-admin (mirrors `NoticeAck`), so one admin's
  tick never hides work from another. Ticks stay keyed to the version they were
  made against; a new snapshot starts a new batch and old ticks remain audit
  data.
- **Pure helpers** — `lib/release-updates.ts`: `parseArea` (`[AREA]` title
  prefix → uppercase; no prefix = `OTHER`), `normaliseSnapshot` (tolerant parse,
  drops bad/duplicate rows), `filterReleaseIssues` (CLOSED/OPEN + search),
  `groupReleaseIssues` (workflow order, OTHER last), `releaseProgress`,
  `versionMatches`, `confirmedIssueSet`.
- **Routes** — `GET /api/admin/updates` returns the snapshot + this admin's
  confirmations + progress over CLOSED issues; a stale `?version=` returns 409.
  `PUT /api/admin/updates/[issueNumber]` `{ version, confirmed, note? }`
  validates the issue exists, upserts on confirm (reviving a soft-deleted row)
  and soft-deletes on untick. Both are ADMIN-only (401/403).
- **UI** — `ReleaseUpdatesClient`: grouped by `[AREA]`, CLOSED by default with
  an OPEN toggle, search, progress bar, issue links, live per-row checkbox
  (optimistic tick → `SAVING…`/`SAVED`, revert + inline error on failure).
  `START NEW RELEASE` re-fetches the current committed snapshot.

### EOD Reconciliation (`/api/admin/inventory/reconcile`)
Aggregates exploded ingredients from completed orders, tallies `requiredBaseQty` per inventory item, and (since #118) adds each selected product option's optional drawdown via `lib/order-drawdown.ts`/`order-drawdown.server.ts` (gram-aware; unmapped choice is a no-op). Returned as reconciliation report. **Read-only** — deferred inventory deduction is still not built (#116).

### FOH Operations View — superseded by the Orders rework
The old ORDERS / FOH VIEW two-tab layout is gone. FOH is now one of the four
view renderers on `/admin/orders` (see "Orders Rework — Phase 4"), fed by
`GET /api/admin/orders?date=` along with every other view.

> **Orphan:** `GET /api/admin/orders/foh` still exists but nothing calls it —
> the rework replaced its only consumer. Kept rather than deleted because it
> predates this work; safe to remove once you're confident nothing external
> depends on it.

### Kitchen Worker View (`/w/kitchen`)
`GET /api/worker/kitchen` (JWT via `jose`) returns today's order items grouped by table with dietary badges, unassigned items section, and prep totals grid. Auto-refreshes every 15s. The worker dashboard has a KITCHEN tile (the old `WorkerHamburgerMenu.tsx` is **dead code** — no longer imported anywhere). Admin nav has KITCHEN under Dashboard. Groundwork for future live service mode: `KitchenStatus` enum (PENDING/COOKING/READY/SERVED) on `WooOrderItem.kitchenStatus`.

## 2026-10-10 UI/UX PASS (all built)

- **Tasks & Checklists scroll fix.** `TasksClient` no longer clips the two-column
  grid to `calc(100vh - 10rem)` + `overflow: hidden` — the page scrolls normally
  and the sticky checklist panel keeps its own internal scroll, so long lists
  (16+ steps) always reach SAVE on desktop and mobile.
- **Guide PDF multi-image / large-image fix.** `lib/guide-pdf.ts` `imageFormat`
  now detects WEBP/GIF (jsPDF was being told everything non-PNG was JPEG, so
  those photos silently vanished); `loadImageDataUrl` no longer drops files
  over the old 2MB cap — big images are re-encoded to JPEG via `sharp`.
  Guide-level PDF attachments are merged into downloads (`mergePdfBuffers`).
- **Customisable dashboard.** `DashboardClient` renders a registry of widgets
  (`lib/dashboard-widgets.ts`: SUMMARY, ATTENTION, PROGRESS, BOOKINGS, ORDERS,
  EVENTS, TRAINING, STOCK, FOOD_SAFETY, LIVE_FLOOR, MISSED, RECENT,
  BY_DEPARTMENT) with drag-to-reorder and show/hide in CUSTOMIZE mode, saved
  per staff in `Staff.dashboardLayout Json?` via `GET/PUT /api/admin/dashboard/layout`.
  Extra data comes from `GET /api/admin/dashboard/widgets` (today's bookings/
  orders, upcoming events, open HsAlerts, clocked-in count, training summary).
- **Budget opens on the current month.** `/admin/budget` redirects to
  `/admin/budget/[year]/[month]`; the 12-month landing (`BudgetLandingClient`)
  is deleted. `BudgetMonthSelector` is now a DateNav-styled month bar
  (`<< YEAR · < MONTH · THIS MONTH · MONTH > · YEAR >>`) — no grid.
- **Recipes are prep-only.** The RECIPES tab authors recipes/BOM; the MENU ITEMS
  tab lists every sold product, including `recipeId: null` products from menu
  import / Woo sync. There is no LINK TO MENU control in the recipe editor.
- **Product detail fields + equipment links.** `MenuItem.tastingNotes`,
  `vintage`, `howToServe` + `MenuItemInventoryItem.qty/note/deletedAt` (the
  long-orphaned model is now live). Edited from the Menu Items page PRODUCT INFO
  (`MenuItemDetailsModal` + `MenuItemEquipmentEditor`, routes
  `GET/PUT /api/admin/menu-items/[id]/equipment`) and from a menu line via
  PRODUCT INFO. Product-reference tables gain derived MENU_FIELD columns
  TASTING_NOTES / VINTAGE / HOW_TO_SERVE / EQUIPMENT (defaults updated).
- **Guide-level PDF + external URL.** `Guide.pdfPath` (uploaded via
  `POST /api/admin/guides/[id]/attachment`, merged into the guide PDF download)
  and `Guide.pdfUrl` (external link). Both surface in the admin editor and the
  worker/admin reader (`GuideReaderContent`).
- **Gift-card live preview in a chrome-free viewer.** `POST
  .../gift-card-templates/[id]/preview` accepts `values` so the issue popup
  previews the data being typed (debounced). All gift-card previews render in
  `components/ui/PdfCanvasViewer` (pdf.js, no toolbar; scroll, ctrl+wheel
  zoom, pinch/double-tap zoom, drag-pan; worker at `public/pdf.worker.min.mjs`,
  copied by `scripts/copy-pdf-worker.mjs` on predev/prebuild). New dep: `pdfjs-dist`.
- **Seamless admin ⇄ worker switching.** `POST /api/worker/switch` mints a
  worker session for the signed-in admin/manager (no PIN); AdminNav has
  WORKER VIEW →, the worker dashboard has ADMIN → for managers. Explicit
  sign-out clears BOTH sessions (admin sign-out also calls `/api/worker/logout`;
  the worker dashboard posts `{ all: true }`), while the worker inactivity
  timers still clear only the worker cookie.
- **Landing page.** Worker-first full-screen entry; the admin email/password
  form now lives behind a discreet `ADMIN LOGIN` button in a modal.
- **Staff: Software Role vs Positions.** Form labels and the staff table now
  separate `SOFTWARE ROLE` (ADMIN/MANAGER/STAFF) from `POSITIONS`.
- **Training STATUS tab + board (updated 2026-10-29).** `TRAINING_TABS` gains STATUS;
  `TrainingStatusClient` shows every active staff member's required/missing/
  stale-guide counts, the **titles** of missing/stale guides and open
  follow-ups as GREEN (good) / YELLOW (bits to work on) / RED (retraining or
  overdue), grouped by derived Position (same `lib/staff-groups.ts` rules as
  availability/roster) with on-shift people first inside each group. Each row
  has **MANAGE GUIDES →**, which opens the existing `StaffGuidesModal` (mark
  trained / sign off / revoke / assign) so training can be completed without
  leaving the board, plus **SHOW GUIDES ▼** to expand that person's guides
  grouped by folder with a TRAINED / TO DO / RETRAIN state per guide (lazy
  loaded from `GET /api/admin/staff/[id]/guides`). It also renders the
  **SECTION REVIEWS** strip
  (confirm/dismiss/reopen pending section-work reviews — see "Section-work
  reviews"). Staff rows come from `GET /api/admin/training/status` backed by
  `lib/training-status.server.ts` (pure rules + sort in `lib/training-status.ts`);
  reviews come from
  `GET /api/admin/section-work?status=ALL` (the single reconcile path). Managers
  reach the same board via the dashboard **TRAINING STATUS** tile or
  `/w/training-status` (rendered inside the worker chrome); it is no longer
  linked from the worker `/w/guides` header.
- **Notices grouping.** Worker notices split into PINNED (top) / unread /
  READ / ACKNOWLEDGED (bottom group) via `lib/notice-groups.ts`.
- **Drag-reorder lists.** Guide steps reorder by drag or ↑/↓ in both editors
  (admin `GuidesClient`, worker `WorkerGuideEditor`).

## 2026-10-13 ROSTER + AVAILABILITY PASS (all built)

- **Drag-fill handles** on every shift block and admin availability day cell —
  drag the corner arrow to copy the shift/settings across cells (roster: days +
  staff rows; availability: days for the same person, admin only). Both copy and
  move drags ask for confirmation; a series availability day additionally offers
  a weekly-series copy or a one-off copy. Worker availability has no drag-fill.
  Shared `lib/cell-fill.ts` rectangle helper; roster copies skip time-off cells.
- **Drag shifts onto other people** — a shift block can be dropped on another
  staff row/day to move it; `PUT /api/admin/shifts/[id]` accepts `staffId`.
- **Role auto-fill** — the shift modal seeds Role from the person's top-ranked
  Position (and loads the shift's stored role + note when editing).
- **Open-shift ↔ roster sync** — manually assigning a shift to an event consumes
  a seat (`fillSeatForShift`); deleting or unlinking the shift re-lists it and
  resets the APPROVED claim so the worker can re-claim.
- **Availability weekly request cut-off** — `Venue.availabilityCutoff` (weekday +
  time) flips a week's worker changes from auto-approval to edit requests once
  the deadline passes; edited in Settings → GENERAL → ROSTER AVAILABILITY with
  a worker deadline banner.
- **DateNav** — quick links are mode-aware (day shows DAY/WEEK, week shows
  WEEK/MONTH, month steps months) and emit whole periods — clicking WEEK no
  longer collapses the view to a single day. The SELECT popover opens in the
  mode currently displayed (week stays week).
- **Series day detach** — choosing JUST THIS DAY on a series occurrence breaks
  that day out of the series (standalone row), so later FROM/ALL series changes
  don't override it; later series changes skip it. The editor says so inline.
- **Series end preview** — changing a no-end series to a fixed end with FROM
  scope now previews the resulting `ENDS dd MON yyyy` date, as a new series does.
  While CHANGE SERIES END is armed, JUST THIS DAY is disabled and the scope
  auto-moves to FROM — a single-day edit cannot carry an end change.

## 2026-10-27 TASKS AUTHORING PASS (#8, #19, #4 gaps, #16 — built)

- **Worker task/list authoring is permission-gated.** `lib/worker-task-access.ts`
  (pure) + `lib/worker-task-access.server.ts` mirror the guide-access pattern:
  ADMIN/MANAGER pass; floor STAFF need `execution.tasks.create|edit|delete`.
  List create accepts CREATE **or** EDIT (the admin route has always used
  `.edit`); list edit/activate = EDIT; deletes = DELETE. `GET /api/worker/tasks`
  returns an additive `access` object and `/w/tasks` passes the same flags from
  the server, so EDIT MODE and every action use grants, not the role alone.
- **Direct add-to-list.** The worker checklist editor has `+ CREATE NEW TASK`
  (opens the task modal pre-scoped to the list's department/section). SAVE
  appends the returned id to the live selection, refreshes the edit data, and
  keeps the list open. The task persists even if the list is cancelled; the
  editor says so. Selected list rows also have EDIT.
- **TaskGuide parity.** The worker competency picker now sends
  `competencyGuideIds` and the worker POST/PUT write
  `TaskGuide.isRequiredForCompetency` (same junction as admin). The legacy
  `requiredTrainingIds` field is still accepted but treated as an alias for
  Guide ids (it always carried Guide ids from the old worker picker); it no
  longer writes `TaskRequiredTraining`/`TrainingModule`. Those legacy rows are
  still READ for display (the worker list still falls back to
  `trainingModules`, and `?edit=1` still returns `requiredTraining`), but the
  worker never writes or deletes them. Edit-mode rows show linked guide titles +
  the task ON/OFF toggle.
- **Venue-checked writes.** Worker task/list POST/PUT validate every incoming
  `departmentId`, `sectionId` and `competencyGuideIds` entry against the
  session venue + `deletedAt: null` (`lib/worker-task-refs.server.ts`) before
  writing. List POST/PUT reject duplicate `taskId`s and validate each task
  belongs to the worker's venue (duplicates are an error, not deduped).
- **List parity.** New `POST/DELETE /api/worker/checklists/[id]/activate`
  mirrors the admin activation. The worker list editor offers ACTIVATE NOW /
  DEACTIVATE only for lists that have an `appearFromTime` (the control is
  hidden otherwise), and compares against the server-supplied venue-local
  `activatedToday` — never the phone's UTC day.
- **`?edit=1` scope.** `GET /api/worker/tasks?edit=1` now requires an authoring
  grant and returns every non-deleted task in the venue (admin parity),
  including `taskGuides.guide`.
- **#19 — live available-task filter.** The admin left list hides tasks in the
  live `clSelected` set (not the `clEditing.tasks` snapshot), works for a brand
  new list (`clEditing === 'new'`), and the usage filter resets to `nolist` on
  close/save.
- **#4 gaps closed.** `DELETE /api/admin/tasks/[id]/progress` (guard
  `execution.tasks.edit`) clears a stale `TaskProgress` row; the admin task row
  shows `IN PROGRESS · <name>` + CLEAR. Report totals are DONE-only:
  `lib/report-filters.ts` builds `{ all, done }`, `/api/admin/reports` returns
  `total` (DONE) and `recordsTotal` (all outcomes for the list/pagination), and
  the page labels them separately. The report list keeps every outcome (and the
  CSV keeps its Outcome column) and now renders an OUTCOME badge per row so
  non-DONE records are distinguishable. Chrome is tested in
  `WorkerDashboardClient.test.tsx` (bottom bar hides on `worker-immersive`;
  browser back re-arms `/w/dashboard`).
- **#16 scroll/state.** `TasksClient` keeps the window + sticky-panel scroll in
  `sessionStorage` (`hospo-tasks-scroll:*`) and restores it after the lists
  finish loading (`loading === false`), not on mount while the page is empty.
  Scoped to the Tasks page; no SPA rewrite.

## FUTURE INTEGRATION STUBS

| Stub | Location | Phase |
|---|---|---|
| Passkeys / WebAuthn login | Admin + worker login upgrade (alongside email/password + PIN) | 2 |
| Push notifications | Not yet wired | 2 |
| S3 file uploads | `UPLOAD_PROVIDER=s3` env var stub | 2 |
| Sensor loggers (ESP32) | LOGGERS tab is a placeholder; no `/api/sensors/*` | 5 |
| SwiftPOS deep sync | Roster data → automatic task assignment | 5 |
| Auto inventory deduction | EOD reconcile is read-only; nothing mutates stock | 5 |
| MyHR onboarding export | Generate onboarding doc from guides | 3 |
| Loaded Reports integration | Export format compatible with Loaded accounting | 4 |
| Microsoft Graph API | Read emails and calendar events (no LLM, read-only) | 5 |
| Microsoft Teams notifications | Send task overdue alerts to Teams channels | 5 |
| Outlook calendar sync | Overlay venue events on task schedule view | 5 |
| Multi-tenant SaaS mode | White-label per business, isolated data per tenant | 6 |
| Mobile app wrapper | Capacitor or React Native shell around worker view | 6 |
| Offline support | Service worker caching for unreliable wifi | 6 |

> Built since the original stub table: budget splitter, labour cost visibility
> (`lib/roster-math.ts`), role-based permission system (`StaffPermission` +
> registry), public API (`ApiKey`), food-safety diary (delivery + reading
> tasks), SwiftPOS sales/drawdown reporting, SwiftPOS staff sync
> (Settings → SWIFT POS → STAFF SYNC), SwiftPOS menu-item linking
> (Settings → SWIFT POS → MENU LINKS), live kitchen dockets
> (Ops → Orders → DOCKETS) and inventory delete protection (#117).

## TESTING

Every code change that touches component logic or hooks MUST include a Vitest
regression test. No test, no merge.

**Stack:** `vitest` + `@testing-library/react` + `jsdom`
**Config:** `apps/web/vitest.config.ts`, setup via `apps/web/vitest-setup.ts`
**Location:** test files live alongside components (e.g. `FloorPlanEditor.test.tsx`
next to `FloorPlanEditor.tsx`).
**Scale (2026-11):** 377 test files / 3,278 cases across `lib`, route handlers and components.

```bash
npm run test          # runs all tests once (also: npm run test in root via turbo)
npm run test:watch    # watch mode (inside apps/web)
npm run lint          # catches hook violations statically (react-hooks/rules-of-hooks: error)
```

**Hook-order regression test pattern:**
Mount a component with a prop that triggers an early return (0 hooks), then
`rerender` with a prop that skips the early return (≥1 hook). Vitest catches the
resulting React #310 error ("Rendered more hooks than during the previous render")
as an unhandled render exception and fails the test.

**Pre-push checklist:**
GitHub Actions is the gate. Open the PR and let the `CI` workflow run lint,
type-check, the full test suite and the Next.js build; fix any red check by
pushing again (`gh pr checks --watch`). To run the same steps locally for fast
feedback (optional), use `scripts/agent/check.ps1`.

## TEST COVERAGE

Every new pure function or hook-bearing component MUST have a corresponding
`*.test.ts` (lib) or `*.test.tsx` (component) file alongside it. GitHub Actions
runs the suite on the PR; `scripts/agent/check.ps1` is an optional local
pre-flight.

### Lib Files

| Target | Coverage |
|---|---|
| `lib/array.ts` — `moveItem` | ✅ |
| `lib/cell-fill.ts` — `fillRect`, `fillTargets`, `inFillRect` (drag-fill rectangles), `dayRange`, `toggleSelection` (bulk-clear selection) | ✅ (11 tests) |
| `lib/availability-comments.ts` / `availability-comments.server.ts` - source/limit + real calendar-date validation; mirror the newest live body onto notes | ✅ (2 + 2 tests) |
| `packages/db/prisma/availability-comment-backfill.ts` - legacy column conversion, deterministic refs, tombstone/legacyRef boot planner | ✅ (11 tests) |
| `lib/use-scroll-restore.ts` — `captureScroll`, `restoreScroll`, `useScrollRestore` (in-place refresh) | ✅ (4 tests) |
| `lib/use-live-refresh.ts` — `shouldPoll` + `useLiveRefresh` (visibility-gated interval, focus/visibility refresh, cleanup) | ✅ (7 tests) |
| `lib/booth-trace.ts` — `traceBoothPerimeter` | ✅ |
| `lib/breaks.ts` — `nzBreakEntitlement`, `shiftHours`, `formatBreaks` | ✅ |
| `lib/budget-math.ts` — `generateDailyBudgetsNormalized`, `computeBreakdowns` | ✅ |
| `lib/dashboard-widgets.ts` — registry, `parseDashboardLayout`, `moveWidget`, `visibleWidgets` | ✅ (6 tests) |
| `lib/training-status.ts` — `trainingLevel`, `sortTrainingRows` | ✅ (5 tests) |
| `lib/guide-warnings.ts` — warning kinds, plain-English reasons, filter/sort/folder grouping, per-guide training state | ✅ (12 tests) |
| `lib/guide-warnings.server.ts` — create filters (PUBLISHED/tracked/duplicate/inactive/cross-venue), assignment upsert, resolve transitions + 409 | ✅ (9 tests) |
| `lib/notice-groups.ts` — `groupWorkerNotices` | ✅ (4 tests) |
| `lib/staff-events.ts` — event field builder, response window/validation, wall-clock now, attendee resolution, attendance counts, ICS escaping, UTF-8 octet folding, UTC DTSTAMP | ✅ (29 tests) |
| `lib/staff-events.server.ts` — invite materialisation (audience ∪ explicit, retire pending, explicit-empty → whole venue), linked Notice sync | ✅ (11 tests) |
| `lib/import/staff-event.ts` — email prompt, tolerant event parse, title+date match | ✅ (8 tests) |
| `lib/recipe-import.ts` — `missingProductFields` | ✅ (3 tests) |
| `lib/budget-lines-import.ts` — `parsePnlRows`, `findMonthRow`, `assignParentIndexes`, `monthYearForName`, `buildLineTree`, `treeTotal` | ✅ (18 tests) |
| `lib/calendar.ts` — `monthDays`, `isValidTime`, `dateKeysBetween` | ✅ |
| `lib/checklist-pdf.ts` — `generateChecklistPdf` (A4 printable checkbox list), `checklistPdfToBuffer` | ✅ (4 tests) |
| `lib/ical.ts` — `feedsForVenue`, `googleEmbedToIcal` | ✅ |
| `lib/scheduling.ts` — `isTaskDueOnDate`, `describeSchedule`, `formatDateKey` | ✅ |
| `lib/utils.ts` — all 8 exports | ✅ |
| `lib/training.ts` — REMOVED with the legacy training UI | — |
| `lib/retrain.ts` — `postRetrainNotice` | ✅ |
| `lib/demo-block.ts` — `shouldBlockDemoWrite` | ✅ (14 tests) |
| `lib/worker-session.ts` — `workerCookieSecure`, `createWorkerSession` / `getWorkerSession` round-trip, cookie maxAge | ✅ |
| `lib/worker-session-timeout.ts` — venue timeout clamp/fallback, `expiresAt`, refresh interval + throttle | ✅ |
| `lib/followups.ts` — `checkUntrainedOnCompletion` (reads `TaskGuide`) + day-aware MISSED progress | ✅ (9 tests) |
| `lib/task-progress.ts` — `progressDayKey`, `isProgressLive`, `isStaleProgress`, `carryTaskToday` (day-aware PARTIAL / multi-day) | ✅ (15 tests) |
| `lib/guides.ts` — `guideSource`, `guideAppliesTo`, `guideWhereOr` | ✅ (25 tests) |
| `lib/guide-links.ts` — `groupTargetIdsByKind`, `attachTargets`, `targetKey` | ✅ (14 tests) |
| `lib/pathway-progress.ts` — `resolvePathwayProgress`, `findPathwayCycle`, `levelForPoints`, `nextLevelThreshold` | ✅ (28 tests) |
| `lib/training.ts` — REMOVED with the legacy training UI | — |
| `lib/external-sync.ts` — `syncVenueCalendar` | ✅ |
| `lib/floorplan-inventory.ts` — `calculateSetupInventory`, `computeSetupSectionTotals`, `pointInPolygon`, geometry fns | ✅ (49 tests) |
| `lib/furniture.ts` — `outlineOf`, `logicalEdges`, `pointAtPerimeter`, `projectToPerimeter`, `defaultChairSlots`, `chairWorldPlacements`, `chairTFromWorld`, `validatePolygon`, chair-set editing | ✅ (66 tests) |
| `lib/furniture.ts` — `setupItemFurnitureKey` (null-key trap) | ✅ (6 tests) |
| `lib/floorplan-chairs.ts` — `adjustEdgeChairs`, `defaultEdgeChairs`, `maxChairsForEdge` | ✅ (11 tests, deprecated with `chairEdges`) |
| `lib/auto-seat.ts` — `planAutoSeat` (bin-packing layout) | ✅ (7 tests) |
| `lib/inventory-engine.ts` — `explodeRecipe` (recursive BOM explosion) | ✅ (5 tests) |
| `lib/customer-match.ts` — `normaliseEmail`, `normalisePhone`, `buildCustomerKeys`, `findMatch`, `fieldsToEnrich`, `resolveCustomer` | ✅ (27 tests) |
| `lib/woo-meta-map.ts` — `resolveMetaMap`, `readMeta`, `parseServiceDate/Time`, `parsePartySize`, `parseFulfillmentType`, `resolveOrderMeta` | ✅ (30 tests) |
| `lib/menu-rules.ts` — `validateOrderAgainstMenu`, `menuAllowsPartySize`, `describePaxRange` | ✅ (19 tests) |
| `lib/order-views.ts` — `aggregateDishTotals` (incl. option breakdown), `aggregateCategoryTotals`, `collectAllergenAlerts`, `groupByTable`, `groupByTimeSlot`, `summarise`, `applyFilters` | ✅ (38 tests) |
| `lib/order-options.ts` — snapshot normalise, price delta, describe, toggle, sort, live validate (required/min/max/default/unknown, multi-select defaults) | ✅ (19 tests) |
| `lib/order-options.server.ts` — own/shared/missing product load, price map, empty short-circuit | ✅ (3 tests) |
| `lib/order-drawdown.ts` — choice qty, gram-aware base units, merge with recipe explosion, unmapped no-op | ✅ (11 tests) |
| `lib/order-drawdown.server.ts` — choice-id mapping, UOM/density passthrough, dedupe/empty | ✅ (2 tests) |
| `lib/order-booking-link.ts` — `findBookingForOrder`, `autoLinkBooking` | ✅ (11 tests) |
| `lib/beo-blocks.ts` — `BEO_BLOCKS`, `blockDef`, `normaliseConfig`, `stripBoundFields`, `makeBlock`, `moveBlock` | ✅ (32 tests) |
| `lib/beo-links.ts` / `beo-pdf.ts` — link grouping / BEO PDF variants | ✅ (8 + 11) |
| `lib/event-flow.ts` / `event-pricing.ts` / `event-share.ts` | ✅ (6 + 10 + 8) |
| `lib/service-schedule.ts` / `service-windows.ts` / `service-seating.ts` | ✅ (19 + 20 + 11) |
| `lib/availability.ts` / `availability.server.ts` — window algebra, free-window state (PARTIAL) + plan→execute + weekly cut-off gate + series-day detach + edit-proposal→entry mapping + add-window splitting | ✅ (78 + 45) |
| `lib/event-roster.ts` — area resolution + per-day event buckets | ✅ (11 tests) |
| `lib/manual-event.ts` — validation, UTC date/time mapping, capacity check | ✅ (9 tests) |
| `lib/calendar-feeds.ts` — feed URL expansion, room naming | ✅ (9 tests) |
| `lib/open-shifts.ts` / `open-shifts.server.ts` — seat expansion, claimable rules, find/claim/approve/cancel | ✅ (12 + 19 tests) |
| `lib/event-roster.ts` — room/day grid, multi-day + all-day mapping, room matching | ✅ (10 tests) |
| `lib/roster-math.ts` / `roster-pdf.ts` / `staff-rate.ts` | ✅ (14 + 2 + 5) |
| `lib/roster-hours.ts` — goal collection, hour-target status (none/under-min/under-goal/met/over), labels, tone, hour-target parsing | ✅ (12 tests) |
| `lib/roster-template.ts` — day-index mapping, week normalisation, template apply/copy planning, staff skips, date/mode validation | ✅ (10 tests) |
| `lib/roster-slot.ts` — slot validation (name/times/break/headcount), seat planning (dedupe/skips/unfilled/max), description | ✅ (11 tests) |
| `lib/nz-payroll.ts` / `payroll.ts` — PAYE/ACC/KiwiSaver engine + payrun bridge | ✅ (26 + 6) |
| `lib/food-safety.ts` — verdicts, GFMP defaults, health metrics | ✅ (37 tests) |
| `lib/unit-convert.ts` — grams canonicalisation + UOM kind helpers | ✅ (37 tests) |
| `lib/ingredient`/`llm-prompt.ts` — density prompt build/parse | ✅ (8 tests) |
| `lib/menu-cogs.ts` / `menu-lines.ts` / `menu-serves.ts` / `menu-sync.ts` | ✅ (8 + 9 + 10 + 9) |
| `lib/import/similarity.ts` / `menu-item.ts` — normalisation, Jaccard/Levenshtein, near-copy match, flat-product parse, CREATE/UPDATE/SKIP defaults | ✅ (12 tests) |
| `lib/import/recipe.ts` — prompt, tolerant recipe parse (duplicates, missing yield unit), exact/ambiguous/similar matching, reference resolution (unknown target/unit → row ERROR), pure `unitKindMismatch` | ✅ (15 tests) |
| `lib/import/markdown.ts` — MD subset → sanitised HTML (headings/lists/bold/italic/links/escaping), guide H1/H2 split, plain-text title fallback | ✅ (9 tests) |
| `lib/import/task.ts` — prompt, day-name/number parsing, completion/schedule/monthly validation, matching, department/section/checklist resolution | ✅ (12 tests) |
| `lib/import/guide.ts` — JSON + Markdown guide parse, audiences/links parsing, PRODUCT_REFERENCE rejection, matching, audience/link/folder resolution, NOBODY WILL SEE THIS warning | ✅ (14 tests) |
| `lib/gift-card-numbers.ts` / `gift-card-template.ts` / `gift-card-history.ts` / `gift-cards-woo.ts` / `gift-cards.ts` | ✅ (10 + 16 + 3 + 8 + 9) |
| `lib/pdf-zoom.ts` — scale clamp, pinch ratio, zoom-around-point scroll, double-tap toggle | ✅ (14 tests) |
| `lib/guide-pdf.ts` / `guide-types.ts` / `guide-folders.ts` / `guides.server.ts` / `guide-media.ts` | ✅ (13 + 4 + 7 + 3 + 6) |
| `lib/reference-table.ts` — derived MENU_FIELD columns + sanitisation | ✅ (19 tests) |
| `lib/rich-text.ts` — `sanitiseRichText` allowlist | ✅ (13 tests) |
| `lib/item-location.ts` — storage-location / linked-item formatting | ✅ (8 tests) |
| `lib/menu-item-allergens.ts` — recipe-derived allergens | ✅ (3 tests) |
| `lib/room-setup.ts` — room label, pax/style, photo URL sanitising, input normalisation | ✅ (9 tests) |
| `lib/checklist-activation.ts` — venue-local date activation, custom schedules, event windows (timed/all-day/multi-day/closed), next-open labels | ✅ (24 tests) |
| `lib/task-outcomes.ts` — outcome hierarchy, DONE-always, reason validation, open-list policy | ✅ (12 tests) |
| `lib/task-subtasks.ts` — max-depth-1 parent validation, parent options, parent/child ordering, cross-list labels | ✅ (11 tests) |
| `lib/task-groups.ts` / `task-groups.server.ts` — label normalisation/grouping, bulk NOT_REQUIRED plan (eligibility, skips, reason gate), checklist-scoped write | ✅ (pure + server tests) |
| `lib/position-requirements.ts` — required guides + readiness resolver | ✅ (6 tests) |
| `lib/section-work.ts` / `section-work.server.ts` — section eligibility, evidence signatures, reconcile/confirm/dismiss/reopen, transition guards, soft-delete restore | ✅ (8 + 21 tests) |
| `lib/staff-groups.ts` — derived position grouping | ✅ (14 tests) |
| `lib/permissions/registry.ts` — `PERMISSION_TREE`, presets, `completeGrantSet` | ✅ (16 tests) |
| `lib/image-annotations.ts` / `image-thumb.ts` | ✅ (24 + 4) |
| `lib/tips.ts` / `swiftpos.ts` / `swiftpos-staff.ts` / `woo-pairing.ts` / `woo-oauth.ts` / `woo-categories.ts` | ✅ (tested) |
| `lib/swiftpos-products.ts` — product parsing, link/orphan/duplicate report, category grouping | ✅ (7 tests) |
| `lib/swiftpos-dockets.ts` — docket parsing (unzoned timestamps), window + supported minutes | ✅ (8 tests) |
| `lib/swiftpos.server.ts` — paged `fetchProducts` cap, `fetchKitchenDockets` window, problem-detail errors | ✅ (6 tests) |
| `lib/video-transcode.ts` / `download-file.ts` / `pdf-safe.ts` / `geo.ts` | ✅ (2 + 4 + 4 + tested) |
| `lib/woo-push.ts` — `mapStatusToWoo`, `buildProductPushPayload` (images, categories, variable products), `pushVariationPrices`, `isSelfEcho` echo guard | ✅ |
| `lib/woo-sync.ts` — `runProductPull`, `upsertProductFromWoo`, `fetchWooCategories`, `fetchProductVariations` | ✅ |
| `lib/internal-cron.ts` — `dueJobs`, `localParts` (scheduler due-checks) | ✅ |
| `lib/parking.ts` — URL/plate validation, venue-local 90-minute window, antiforgery/session/result parsers, cookie jar, health state | ✅ (38 tests) |
| `lib/scan2pay.server.ts` — cookie-jar GET, antiforgery POST, existing-session short-circuit, redirects, payment/confirmation step, failures | ✅ (18 tests) |
| `lib/parking-health.server.ts` — enabled-only runs, daily dedupe, READINESS/FULL/OFF, failure recording | ✅ (11 tests) |
| `lib/parking-kiosk.ts` — kiosk code normalise/validate, plate keypad, countdown/clock formatting | ✅ (9 tests) |
| `lib/parking-kiosk.server.ts` — sha256 hashing, code generation/hint, signed cookie round-trip, tamper rejection | ✅ (6 tests) |
| `lib/staff-parking.ts` — submission errors (plate, duplicate, pending, owner, reason, length), review transitions, add-vs-replace planning, sorting | ✅ (14 tests) |
| `lib/ftp-settings.ts` — email/URL/duration validation, FTP input normalisation, view defaults, kiosk URL | ✅ (10 tests) |
| `lib/rate-limit.ts` — fixed-window allow/block/reset, independent keys, client key | ✅ (5 tests) |
| `lib/auth.ts` — `authOptions` | ⬜ TODO |

### Component Regression Tests

| Target | Coverage |
|---|---|
| `FloorPlanView.test.tsx` — useMemo callback guard (React #310) | ✅ |
| `FloorPlansClient.test.tsx` — renders with ADMIN/MANAGER roles | ✅ |
| `AdminNav.test.tsx` — renders nav groups | ✅ |
| `FloorPlanEditor.tsx` — 30+ hooks, useMemo, loading gate | ✅ |
| `BudgetPageClient.tsx` — useCallback + useEffect chain | ✅ |
| `PdfCanvasViewer.tsx` — pdf.js viewer source + error fallback, double-tap toggle, two-finger pinch, mouse drag-pan, zoom memory | ✅ (6 tests) |
| `BudgetLinesPanel.tsx` — tree render, totals, add/import flows | ✅ (5 tests) |
| `BudgetImportModal.tsx` — parse preview, include toggles, commit | ✅ (4 tests) |
| `CalendarClient.tsx` — 22 useState | ✅ |
| `DateNav.tsx` — mode-aware quick nav (day/week/month), whole-period ranges, popover opens in the displayed mode | ✅ (21 tests) |
| `WorkerTasksClient.tsx` — outcomes, PARTIAL/in-progress, finished collapse + SHOW FINISHED, coloured status boxes, finished-list sort, multi-day editor, settled UNTICK/REOPEN, grant-gated authoring, direct add-to-list, TaskGuide picker, ON/OFF, list activation, subtask grouping/ADD SUBTASK, dual early-return paths, live-refresh on focus + pause while an editor is open, task groups + bulk NOT_REQUIRED confirmation | ✅ (33 tests) |
| `TasksClient.test.tsx` — #19 live available filter (existing + new list), usage reset, stale PARTIAL clear, multi-day list flag, subtask indent/add/parent picker, scroll restore after load, linked item + rich description | ✅ (15 tests) |
| `MenuItemsClient.test.tsx` — recipe-less product listed and saved with `recipeId: null` | ✅ (1 test) |
| `RecipesClient.test.tsx` — volume/weight display + header opens the shared recipe importer | ✅ (5 tests) |
| `components/import/ImportModal.test.tsx` — generic rows + custom summary, per-row value patch (`REPLACE LINES`) posted to the given endpoint, default menu-item summary, inline field edit posted with the row, parse error | ✅ (4 tests) |
| `WorkerDashboardClient.test.tsx` — iframe bottom-bar hiding + browser-back history guard + live TASKS tile refresh (tile return + window focus) + new worker tiles (Kitchen, Deliveries, Gift Cards gating, Parking gating/warning + staff-plate-only tile, Training Status manager-only) | ✅ (12 tests) |
| `WorkerParkingClient.tsx` — plate input, arrival quick-adjust, success/duplicate/error cards, service warning, today's list | ✅ (6 tests) |
| `GuestParkingSettings.tsx` — config load/save, toggle, RUN CHECK NOW, health warning, save error | ✅ (5 tests) |
| `KioskParkingClient.tsx` — plate entry, success/already/failed, QR + countdown reset, START AGAIN, staff sheet, 4 hour disabled | ✅ (6 tests) |
| `PlateKeypad.tsx` — letters/digits/edit keys, callbacks, disabled state | ✅ (3 tests) |
| `KioskUnlock.tsx` — code submit, error, changed-code note | ✅ (3 tests) |
| `FtpSettingsClient.tsx` — four areas, kiosk URL/code, save, 4 hour disabled | ✅ (4 tests) |
| `StaffPlatesPanel.tsx` — pending request list, approve with note, entered tick | ✅ (3 tests) |
| `WorkerStaffPlateCard.tsx` — hidden when off, current plate/system state, add/change request | ✅ (3 tests) |
| `ReportsClient.tsx` — OUTCOME badge distinguishes non-DONE rows | ✅ (1 test) |
| `WorkerSessionGuard.tsx` — idle logout/redirect, activity refresh, refresh throttle, iframe activity relay | ✅ (6 tests) |
| `lib/worker-task-access.ts` — grant matrix (ADMIN/MANAGER bypass, CREATE/EDIT/DELETE, list OR mapping) | ✅ (6 tests) |
| `lib/worker-task-refs.server.ts` — venue checks for department/section/Guide refs | ✅ (6 tests) |
| `lib/task-guides.ts` — competency ids with legacy `requiredTrainingIds` alias, trim, malformed input | ✅ (5 tests) |
| `lib/report-filters.ts` — DONE-only completion metric vs all-outcome audit where | ✅ (4 tests) |
| `OutcomeOptions.tsx` — DONE-always, outcome toggles, reason toggle, inherit/override | ✅ (4 tests) |
| `FloorplanInspector.tsx` — presets, sliders, booth capacity | ✅ |
| `FloorplanToolbar.tsx` — zoom, DIM toggle | ✅ |
| `Button` (ui) — variants, sizes, loading, disabled | ✅ |
| `Input` (ui) — label, error, onChange | ✅ |
| `Select` (ui) — options, placeholder, error, onChange | ✅ |
| `SetupInventoryPanel.tsx` — button states, shortage list, idle, empty, disabled | ✅ (7 tests) |
| `FurniturePalette.tsx` — tiles, availability, drag payload, arming, chair exclusion, filters, polygon render | ✅ (13 tests) |
| `FurnitureShapeEditor.tsx` — preview vs draw mode, live seat/area readout, vertex handles, validation | ✅ (13 tests) |
| `PathwaysClient.tsx` — list, open, board/tree tabs, blocked-node preview, SAVE gating | ✅ (7 tests) |
| `WorkerPathwayTree.tsx` — stage columns, locked node names its blocker, locked stays readable | ✅ (9 tests) |
| `GuideStepLinks.tsx` — kinds, qty prefix, missing target, note vs sub-line | ✅ (8 tests) |
| `PositionsPanel.tsx` — list, ALL DEPARTMENTS, empty state, blank-name guard, POST body | ✅ (5 tests) |
| `GuidesClient.tsx` — folders, publish, product-reference rows, PDF actions | ✅ (10 tests) |
| `ReferenceTableEditor.tsx` — column kinds, derived cells, row editing | ✅ (5 tests) |
| `WorkerGuidesClient.tsx` — BIBLE / MY TREE, folder grouping + drag, edit gating, red guide card + guide reader; no training-status link and no needs-attention strip | ✅ (13 tests) |
| `EventBuilder.tsx` / `PipelinePanel.tsx` / `EnquiriesPanel.tsx` — BEO builder, pipeline board, intake | ✅ (5 + 2 + 4) |
| `AvailabilityBar.tsx` / `AvailabilityDayEditor.tsx` / `WorkerAvailabilityClient.tsx` / `AvailabilityAdminClient.tsx` | ✅ (4 + 30 + 20 + 43) |
| `RosterClient.tsx` / `ClocksClient.tsx` / `PayrollClient.tsx` | ✅ (15 + 5 + 4) |
| `RosterTemplatesModal.tsx` — template list, save current week, apply to target week, REPLACE confirmation, next-week default | ✅ (5 tests) |
| `RosterCopyWeekModal.tsx` — ADD copy, REPLACE confirmation, next-week default | ✅ (3 tests) |
| `RosterSlotsModal.tsx` — slot list, create slot, place slot for selected staff | ✅ (3 tests) |
| `StaffingLinesEditor.tsx` — payload mapping, unnamed-row filter, rows, remove | ✅ (5 tests) |
| `OrderOptionPicker.tsx` — group/choice render, single-select replace, snapshot payload, summary + upcharge, no-groups empty | ✅ (5 tests) |
| `NewOrderModal.test.tsx` — default preselected, total = base + upcharge, POST sends the base unitPrice + snapshot, shaped menu line picker | ✅ (4 tests) |
| `OrderDetailDrawer.test.tsx` — booking controls; chosen options shown; PUT edits snapshot; stored-price base; null-price product fallback | ✅ (8 tests) |
| `EventStaffingModal.tsx` — event info, linked shifts CLAIMED/ASSIGNED, listed-seat lock, FIND STAFF, claims review | ✅ (5 tests) |
| `CalendarEventFormModal.tsx` — create + staffing POST, capacity warning, edit load/PUT | ✅ (2 tests) |
| `WorkerShiftsClient.tsx` — pickup grid, claim/withdraw, conflict warning, confirmed panel | ✅ (5 tests) |
| `TrainingStatusClient.tsx` — status rows + WARNINGS list (flat/folder, grant-gated mark retrained / dismiss) + SECTION REVIEWS strip, CONFIRM/DISMISS/error surfacing, position grouping, guide titles, MANAGE GUIDES modal, `SHOW GUIDES ▼` person → folder-grouped expansion (trained/to-do/retrain, always refetched on expand and after the modal closes) | ✅ (15 tests) |
| `StaffGuidesModal.tsx` — folder grouping + ALL GUIDES flat view, stale red warning reason, mark-for-retraining flow, grant-gated actions | ✅ (3 tests) |
| `StaffEventNoticeCard.tsx` — full inline details, Accept/Decline/Maybe gating, required decline reason, current answer, Add to calendar, closed window, reminder, close-time label fallback | ✅ (9 tests) |
| `StaffEventsPanel.tsx` — event/attendance counts, remind action, attendance popup with decline reasons, forbidden-picker warning | ✅ (3 tests) |
| `WorkerNoticesClient.tsx` staff-event branch — inline details, no GOT IT, accept posts to respond | ✅ (2 tests) |
| `WorkerStaffEventClient.tsx` — detail load, required decline reason, respond payload | ✅ (1 test) |
| `RoomSetupModal.tsx` / `RoomSetupCard.tsx` — editor payload, label preview, photo card, table-plan thumbnail | ✅ (3 + 3 tests) |
| `StaffAccessDrawer.tsx` / `OpsClient.tsx` / `MenusClient` builder components | ✅ (4 + 7 + tested) |
| `SwiftPosMenuLinks.tsx` / `KitchenDocketsClient.tsx` / `MenuItemDetailsModal.tsx` / `SwiftPosStaffSync.tsx` | ✅ (4 + 4 + 1 + 2) |
| `EventShareClient.tsx` / `WorkerEventsClient.tsx` / `WorkerTimeclockClient.tsx` | ✅ (4 + tested) |
| `ImageAnnotator` / `ImagePicker` / `AnnotatedImage` / `MediaLibraryModal` / `Panel` / `Combobox` | ✅ (co-located tests) |

### Route Tests

| Target | Coverage |
|---|---|
| `app/api/admin/availability/route.test.ts` — GET includes the off-range edit request's current row; POST returns the locked-day 409 | ✅ (2 tests) |
| `app/api/admin/availability/comments/route.test.ts` - auth, venue scope + explicit venueId, restricted-manager canAdd/canDelete, MANAGER stamping, delete, impossible date | ✅ (13 tests) |
| `app/api/worker/availability/comments/route.test.ts` - auth, own-day scope, WORKER_APP stamping, toggle-gated own delete, impossible date | ✅ (9 tests) |
| `app/api/worker/availability/series-request/route.test.ts` — auth, required date/series, request delegation, 404/409 passthrough | ✅ (5 tests) |
| `app/api/worker/availability/route.test.ts` — auth, past-anchor 400, FROM + worker scope policy passthrough | ✅ (3 tests) |
| `app/api/worker/checklists/[id]/not-required/route.test.ts` — auth, body mapping (group/taskIds/note), error status passthrough | ✅ (3 tests) |
| `app/api/worker/tasks/[id]/complete/route.test.ts` — completion responds without waiting for the best-effort follow-ups; PARTIAL stamps `progressDate`; retracted rows are ignored; DELETE soft-deletes, records the undo and resolves UNTRAINED; venue rejection | ✅ (6 tests) |
| `app/api/worker/tasks/route.test.ts` — stale today-only PARTIAL dropped + swept, multi-day partial carried and never swept, today partial carried | ✅ (3 tests) |
| `app/api/admin/tasks/[id]/route.test.ts` — GET parent/children + linked item, parent validation 400s, linked-item validation/sanitisation, DELETE unparents children | ✅ (8 tests) |
| `app/api/admin/tasks/item-options/route.test.ts` — auth, grant, manager venue scope, active/non-deleted items | ✅ (4 tests) |
| `app/api/admin/menu-items/route.test.ts` — null recipe, cross-venue recipe, recipe-derived allergens | ✅ (3 tests) |
| `app/api/admin/recipes/route.test.ts` — a recipe save never writes a MenuItem | ✅ (1 test) |
| `app/api/admin/import/recipes/route.test.ts` — GET candidates + MANAGER scope; POST resolves line ids, skips unknown targets, UPDATE without/with REPLACE LINES, skips CREATE of an existing name, requires `ops.recipes.edit` for UPDATE, MANAGER venue lock, empty payload | ✅ (10 tests) |
| `app/api/admin/import/tasks/route.test.ts` — GET refs + MANAGER scope; POST creates DRAFT tasks with resolved dept/section + checklist link, skips unknown department / invalid weekly, UPDATE preserves status, edit-permission gate, MANAGER venue lock, empty payload | ✅ (9 tests) |
| `app/api/admin/import/guides/route.test.ts` — GET refs + MANAGER scope; POST creates DRAFT guides with audiences/steps/links, creates a missing folder, skips unknown audience/link, warns NOBODY WILL SEE THIS, rejects PRODUCT_REFERENCE, UPDATE with/without REPLACE STEPS, edit-permission gate, MANAGER lock, empty payload | ✅ (13 tests) |
| `app/api/admin/swiftpos/staff/route.test.ts` — LINK sets the PIN from the clerk id, keeps an existing PIN, and links without a PIN on a clash | ✅ (3 tests) |
| `app/api/admin/roster/templates/route.test.ts` — auth/guard, list with names, save week normalised to day indexes, empty-week 422 | ✅ (7 tests) |
| `app/api/admin/roster/templates/[id]/route.test.ts` — delete soft-deletes the template and its shifts, 404/403 | ✅ (5 tests) |
| `app/api/admin/roster/templates/[id]/apply/route.test.ts` — ADD creates DRAFT rows + skips staff, REPLACE soft-deletes/releases, missing position cleared, no-active-staff 422, cross-venue 403, bad date 400, 401/404 | ✅ (8 tests) |
| `app/api/admin/roster/copy/route.test.ts` — ADD copy, REPLACE clear/release, inactive-staff 422, same-week/invalid-date 400, 401 | ✅ (6 tests) |
| `app/api/admin/roster/slots/route.test.ts` — list with position names, create, invalid input, cross-venue position | ✅ (5 tests) |
| `app/api/admin/roster/slots/[id]/route.test.ts` — update, invalid input, 404/403, soft delete | ✅ (6 tests) |
| `app/api/admin/roster/slots/[id]/place/route.test.ts` — DRAFT shifts + unfilled seats, missing position cleared, over-headcount 422, inactive 409, missing date 400, no staff 422, cross-venue 403, 401/404 | ✅ (9 tests) |
| `app/api/admin/staff/[id]/route.test.ts` — section-review dismiss + weekly hour-target validation (negative rejected, two-decimal rounding) | ✅ (4 tests) |
| `app/api/admin/orders/route.test.ts` — option snapshot persisted, upcharge folded into price/total, default applied, null-price product fallback, 422 on required/unknown, no-group line stores none | ✅ (6 tests) |
| `app/api/admin/orders/[id]/route.test.ts` — PUT re-validates options, folds upcharge, clears snapshot, preserves a line when options are omitted, null-price fallback, 422 on unknown / cross-venue product | ✅ (6 tests) |
| `app/api/admin/inventory/reconcile/route.test.ts` — choice drawdown × line qty + gram-aware merge; read-only (no stock writes) | ✅ (2 tests) |
| `app/api/admin/guide-warnings/route.test.ts` — auth, view guard, manager venue lock, admin venue param, assign/sign-off flags, 404 | ✅ (6 tests) |
| `app/api/admin/guide-retrain/route.test.ts` — assign guard, missing staff, venue access/derivation, manager lock, create payload, server error passthrough | ✅ (6 tests) |
| `app/api/admin/guide-retrain/[id]/route.test.ts` — assign guard, invalid action, request-venue resolution, venue access, RESOLVE/DISMISS mapping, closed-request 409 | ✅ (6 tests) |
| `app/api/worker/guide-retrain/route.test.ts` — auth, assign grant, session-venue lock, missing staff | ✅ (4 tests) |
| `app/api/worker/guide-retrain/[id]/route.test.ts` — target self-resolve, non-target denied, target dismiss denied, assign-grant path, invalid action, venue 404, 409 | ✅ (7 tests) |
| `app/api/worker/guide-warnings/route.test.ts` — auth, own-only warnings for staff, whole venue + picker for managers | ✅ (3 tests) |
| `app/api/admin/staff-events/route.test.ts` — create publishes + materialises invites/notice, draft stays private, manager venue lock, explicit invitee validation, invalid times | ✅ (6 tests) |
| `app/api/admin/staff-events/[id]/route.test.ts` — GET/PUT/DELETE, DRAFT resync, published notice sync, audience retention, explicit-empty whole-venue fallback, manager venue block | ✅ (7 tests) |
| `app/api/admin/staff-events/[id]/publish/route.test.ts` — publish materialises + sends notice, audience-less/no-invite 409, whole-venue draft publish, manager block | ✅ (4 tests) |
| `app/api/admin/staff-events/[id]/remind/route.test.ts` — stamps pending invites + event, draft 409, manager venue block | ✅ (3 tests) |
| `app/api/worker/staff-events/[id]/route.test.ts` — PUBLISHED-only lookup, invite check, explicit vs effective deadline | ✅ (5 tests) |
| `app/api/worker/staff-events/[id]/respond/route.test.ts` — auth, invite/venue 404, Maybe gate, required decline reason, Accept save + counts, closed deadline 409 | ✅ (6 tests) |
| `app/api/worker/staff-events/[id]/ics/route.test.ts` — auth, PUBLISHED-only lookup, invite check, calendar headers + body, UTC DTSTAMP | ✅ (4 tests) |
| `app/api/admin/import/staff-events/route.test.ts` — refs + manager scope, DRAFT create with resolved audience, no invites on import, unknown audience NOBODY warning, invalid row skip, UPDATE skip, empty payload | ✅ (7 tests) |
| `app/api/admin/parking/config/route.test.ts` — auth, defaults, host/path validation, enable-requires-URL, create/update/revive, duration clamp, manager venue lock | ✅ (10 tests) |
| `app/api/worker/parking/route.test.ts` — auth, disabled 403, plate/arrival validation, duplicate 409 + extend link, success persistence, upstream 502 | ✅ (9 tests) |
| `app/api/cron/parking-health/route.test.ts` — CRON_SECRET auth, summary counts, `?force=1` | ✅ (3 tests) |
| `app/api/public/parking/kiosk/unlock/route.test.ts` — short code, wrong code, parking disabled, success cookie | ✅ (4 tests) |
| `app/api/public/parking/kiosk/lock/route.test.ts` — no session, wrong code, correct code clears | ✅ (3 tests) |
| `app/api/public/parking/kiosk/register/route.test.ts` — open mode without a session, code-required/rotated, plate validation, success + QR, no DB write, ALREADY_ACTIVE, upstream failure | ✅ (8 tests) |
| `app/api/admin/parking/ftp/route.test.ts` — auth, defaults, manager lock, email/4h validation, kiosk requires parking, require-code needs a code, save | ✅ (10 tests) |
| `app/api/admin/parking/ftp/kiosk-code/route.test.ts` — admin-only, hashed code once, venue selection | ✅ (3 tests) |
| `app/api/admin/parking/staff-plates/route.test.ts` — auth, lists + counts, manager venue lock | ✅ (2 tests) |
| `app/api/admin/parking/staff-plates/[id]/review/route.test.ts` — 404/403, invalid action, double review 409, reject, approve replaces plate | ✅ (6 tests) |
| `app/api/admin/parking/staff-plates/[id]/route.test.ts` — 404/403, mark entered, clear stamp | ✅ (4 tests) |
| `app/api/worker/parking/staff-plate/route.test.ts` — auth, disabled, own plates, note required, add/change, other owner | ✅ (8 tests) |

## PRE-COMMIT CHECKLIST

When the user signals intent to commit and test (e.g. "I'm going to commit",
"time to push", "ready to test on live", "let's ship this"):

1. **Push and let GitHub Actions run the gate.** The `CI` workflow runs on every
   pull request (Prisma generate, lint, type-check, the full test suite and the
   Next.js build). Fix red checks by pushing again; watch with
   `gh pr checks --watch`. Do not run a local build.

2. **The image build is automatic.** Merging/pushing to `develop` builds and
   pushes `:develop` via `Build and publish image`; `main` gets `:latest`.
   Nothing is built locally. `scripts/agent/publish.ps1` is a fallback only.

3. **Produce a test checklist** — write it into `.test-checklist.md` (gitignored)
   as a markdown checkbox list. Group items by page using path-style navigation
   (e.g. `Admin → Ops hub → Bookings`, `Admin → Team & execution → Roster & Pay`).
   The user uses these markers:

   | Marker | Meaning |
   |---|---|
   | `- [x]` | Done — tested and works, stays visible for progress tracking |
   | `- [ ]` | Not yet tested |
   | `- ` (dash, no bracket) | New feature idea or item to add |
   | Tab-indented line below an item | Note/issue — needs work and retest |

   Read the file first to preserve existing progress and notes. Skip completed
   `[x]` items when planning fixes. Focus on items with notes (need retest) and
   unchecked `[ ]` items.

   Do NOT edit the file while the user is working on it live — they update it
   during testing. Only write to it at the start of a new session or when
   generating a fresh checklist for a new round of changes.

4. **Update the docs** (AGENTS.md, README.md, NAVIGATION.md, MENUS.md) to reflect
   any new models, API routes, design conventions, or feature phases.
   (`ROADMAP.md` / `ECOSYSTEM.md` no longer exist — `scripts/check-docs.mjs`
   should be updated to drop them.)

5. **GitHub Actions CI** — automatic on PRs and on pushes to `develop`/`main`
   (plus `v*` tags). Do not run a local build. If a workflow file changed in this
   session, flag it.

## WHAT NOT TO DO

- **NO hard deletes** — never call `prisma.model.delete()`. Always set `deletedAt`.
- **NO `any` types** — TypeScript strict mode. Use types from `packages/types`.
- **NO inline styles** — Tailwind utility classes only.
- **NO plain-text PINs or API keys** — bcrypt-hash PINs, sha256-hash `ApiKey`/event-share tokens; raw values shown once, never logged.
- **NO direct DB access in client components** — Server Actions or API routes only.
- **NO manual schema changes** — change `schema.prisma`, never hand-edit the DB. (Deploy syncs it via `prisma db push`; see "Why db push" above.)
- **NO storing session tokens in `localStorage`** — HTTP-only cookies only.
- **NO Prisma imports in a client-imported `lib/*.ts`** — split the server half into `*.server.ts` (page loads / client bundles fail on `Can't resolve 'fs'` otherwise). This applies to guide-links, reference-table, menu-lines, etc.
- **NO module-level React Flow/PixiJS imports in server components** — load canvases with `next/dynamic { ssr: false }` (`FloorPlanPixiCanvas`, `StructureGraph`).
