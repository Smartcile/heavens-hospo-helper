# HOSPO OPS — AI CODING CONTEXT

HOSPO OPS is a self-hosted hospitality ERP and operations platform. It manages venues, staff, tasks, inventory, recipes, floor plans, budgets, and WooCommerce integration with auto-seating, recipe explosion, and inventory deduction.

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
│   │   │   ├── schema.prisma       # 128 models (as of 2026-10)
│   │   │   ├── seed.ts             # Idempotent demo/sample data
│   │   │   ├── migrate-*.ts        # One-off migrations wired into docker-entrypoint.sh
│   │   │   └── migrations/         # Legacy 0_init migration (kept for reference)
│   │   ├── prisma.config.ts        # Prisma 7 config (datasource, seed)
│   │   └── index.ts                # Exported Prisma client (global singleton, PG pool)
│   ├── types/                      # Shared TypeScript types/interfaces
│   └── config/                     # Lightweight package (tailwind.config.ts migrated to CSS @theme)
├── .github/workflows/
│   └── docker-build.yml            # CI: lint + turbo test, builds image, pushes to GHCR
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

The image is built by GitHub Actions (`.github/workflows/docker-build.yml`) and
published to `ghcr.io/smartcile/heavens-hospo-helper` on every push to
`master`/`develop` and on `v*` tags (CI runs `npm run lint` + `turbo run test`
first). The root `docker-compose.yml` PULLS that image — nothing is built on
the server.

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
`db:migrate-timeoff` → `db:seed` (idempotent) → `next start -H 0.0.0.0 -p 3000`.
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
`db:backfill-guide-audiences`, `db:migrate-timeoff`. Manual/dev-only:
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
| `INTERNAL_CRON` | Built-in scheduler (Woo product pull + expiry scan). Default true; `false` = use external scheduler |
| `CRON_SECRET` | Bearer token for the /api/cron endpoints (external schedulers only) |
| `WORKER_SESSION_SECRET` | JWT secret for worker PIN sessions |
| `WORKER_SESSION_EXPIRY_MINUTES` | Worker auto-logout timeout (default: 15) |
| `UPLOAD_PROVIDER` | `local` (Phase 1) — future: `s3` |
| `UPLOAD_PATH` | Where uploaded files are written to disk |
| `NEXT_PUBLIC_APP_NAME` | Client-side app name |
| `NEXT_PUBLIC_WORKER_SESSION_EXPIRY_MINUTES` | Client-side inactivity timer value |

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
  in the worker's "My Guides" list, tracks completions, and supports sign-off and
  onboarding. When false, it's a reference-only document (old SOP/FAQ/HOWTO).
- `requiresSignOff: boolean` — when true, a manager must sign off via the Staff
  page modal. When false, the worker self-completes.
- `isOnboarding: boolean` — applies to ALL staff regardless of department.
- `departmentId: String?` — deprecated in favour of `GuideAudience`; still honoured by the resolver.

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
isTracked/requiresSignOff/isOnboarding checkboxes, steps (heading, content,
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
`/api/worker/guides` (`lib/worker-guide-access.ts` gates). The worker editor
omits `links` so a worker save can never wipe admin-authored step links.

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
`lib/availability.ts` (59 tests — window algebra, `autoComplement` = anything
not AVAILABLE is UNAVAILABLE, series helpers, presets); Prisma work in
`lib/availability.server.ts` (18 tests — plan→execute model). Workers declare at
`/w/availability` (`WorkerAvailabilityClient` + shared
`components/availability/`). AVAILABLE-only days auto-approve and stay editable;
any change/clear touching an APPROVED UNAVAILABLE/time-off row is stored as an
`AvailabilityEditRequest` (scope THIS/FROM/ALL) for a manager to APPLY or
DISCARD. `/admin/team?tab=availability` (`AvailabilityAdminClient`) is the
review grid. Routes: `/api/admin/availability` (+ `/clear`, `/review`,
`/requests/[id]`), `/api/worker/availability` (+ `/clear`, `/[id]`,
`/requests/[id]`). Guards: `team.availability.view|edit|approve`.

**Roster** — `/admin/team?tab=roster` (`RosterClient`, 7 tests): week/day grid,
staff grouped by derived Position (drag headers; persisted `Position.sortOrder`),
DRAFT/MIXED/PUBLISHED week status (`ShiftStatus`; only PUBLISHED shifts reach
workers) with bulk publish via `POST /api/admin/roster/publish`, shift modal
(role/colour/tag/break/note), soft warnings for availability conflict + role
readiness (never blocking), PDF export (`lib/roster-pdf.ts`), and a footer
showing paid hours/cost vs budgeted REVENUE (staffing ratio — `lib/roster-math.ts`,
14 tests; `lib/staff-rate.ts` resolves StaffPosition → Position → Staff rate).
Routes: `GET /api/admin/roster`, `POST /api/admin/roster/publish`,
`POST/PUT/DELETE /api/admin/shifts(+/[id])`.

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
`BeoBlockReferences`), plus `BlockLibraryPanel` for custom defs.

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
| `/api/worker/floorplan/setups` | GET | Worker setup list |
| `/api/worker/floorplan/setups/[id]` | GET | Worker setup detail |

> **Removed:** `/api/admin/table-profiles*` and the `/admin/table-profiles` page
> are gone — furniture lives on `InventoryItem` (see "Furniture Unification").

**Worker View:** `WorkerFloorPlan` has been extended with a setup switcher dropdown (alongside
the existing view switcher). Workers can switch between the base plan and any setup. Setup
items render on the read-only canvas with auto-assigned numbers as labels. A setup banner
shows the active setup name.

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
redirects) — `OpsClient` renders **INVENTORY · PANTRY BIBLE · STOCKTAKE** sub-tabs
(`lib/hub-tabs.ts`). `InventoryClient` is a master-detail layout — left column
(vertical CATEGORIES nav + INVENTORY SUMMARY tree), right column (item list with
real AVAIL column + compact PROPERTIES form). Dynamic headers
(`FURNITURE STOCK`/`STANDARD STOCK`) and buttons (`+ ADD TABLE`/`+ ADD ITEM`)
based on the selected category. Items can be edited (PUT) and duplicated, and
**SHOW DELETED** reveals RESTORE (`POST .../restore`) + PURGE
(`DELETE ?permanent=1`).

**Stock-aware tracking:** `InventoryItem.totalQty` is the physical count of items
owned. `GET /api/admin/inventory` returns `placedCount` (from
`_count.elements`) so the UI computes `availableQty = totalQty - placedCount`.

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
comma-separated `dietaryInfo` on `MenuItem`. The `GET /api/admin/menu-items` endpoint
resolves inherited allergens by walking the recursive recipe BOM — a menu item shows
its own allergens PLUS any allergens from sub-recipes, with inherited ones locked (⚿)
and showing the source recipe in a popup. The recipe editor has an ITEM LINKS /
LINK TO MENU toggle; linked products show up as inherited allergen sources.

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

### SwiftPOS integration (partial, 2026-09)
`Venue.swiftPosBaseUrl` + `MenuItem.swiftPosId` (SwiftPOS `Inventory_Code`).
`lib/swiftpos.ts` (5 tests) parses a SwiftDOSnet sales report and matches rows to
products by `swiftPosId`; `lib/swiftpos.server.ts` fetches
`/api/analytics/sales?groupBy=product`. `lib/swiftpos-consumption.server.ts`
turns sales into drawdown — MADE serves go through `explodeRecipe`,
pour/bottle via `canonicalQty` — and reports variance vs on-hand for BASE items.
**Read-only report; nothing mutates stock** (auto-deduct not built). Admin UI at
Settings → SWIFT POS (`SwiftPosSalesClient`); route
`GET /api/admin/swiftpos/sales[?drawdown=1]` (guard `ops.inventory.view`).
Staff records carry `Staff.swiftPosId` for future roster/task sync (not built).

### Unified staff identity
A single `Staff` profile carries external-system link IDs — `swiftPosId`,
`myHrId`, `loadedReportsId` — so one person maps across SwiftPOS, MyHR, and
LoadedReports. These are editable in the Staff form; automated sync is a
future item. `email` doubles as a natural cross-system match key.

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
Services, Bookings, Orders, Customers, Inventory & Stocktake) · **Events** (BEO
Planner, Event Templates, Requests) · **Team & execution** (Roster & Pay, Daily
Tasks, Training, Notices) · **Compliance** (Food Safety) · **Performance**
(Reports, Budget, Tips, Gift Cards) · **Setup & config** (Floor Plans, Settings).
Nav items are filtered by permission area when the session is a restricted
manager (`NAV_ITEM_AREAS` + `sessionGrantedAreas`).

`lib/hub-tabs.ts` defines every hub's tabs (`OPS_AREAS`/`OPS_SUB_TABS`,
`TEAM_TABS`, `EXECUTION_TABS`, `TRAINING_TABS`, `SETTINGS_TABS`,
`COMPLIANCE_TABS`, `EVENTS_TABS`) and `lib/ops-redirect.ts` `hubRedirect()`
preserves non-tab query params. Old standalone URLs (`/admin/recipes`,
`/admin/orders`, `/admin/staff`, `/admin/review`, `/admin/guides`, …) are thin
redirect stubs into their hub — **add new pages as hub tabs, not new sidebar
entries**.

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
- **Timed lists.** `Checklist.appearFromTime` ("HH:mm" venue-local). The worker
  tasks API also returns the floor's checklists (`{id,name,appearFromTime,taskIds}`,
  department + whole-venue scoped). `WorkerTasksClient` groups pending tasks by
  **list** first — a list shows once `now >= appearFromTime` and stays until all
  its tasks are done (no expiry) — then falls back to dept → section for tasks in
  no list, with an "opens later" note for not-yet-open lists. Time compared
  against the device clock (staff are on-site).
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
  bump when a save includes `requireRetrain: true` (a "Require re-training"
  toggle on the Task and Training edit forms, with an optional `changeSummary`).
  `lib/retrain.ts:postRetrainNotice` then auto-creates a must-acknowledge
  `Notice` (priority IMPORTANT, pinned) targeted at the item's department (null =
  whole venue). Staff acknowledge via the existing `/w/notices` GOT IT flow;
  managers track acks on `/admin/notices`. Reuses notice/ack infra — no new
  worker screen. Best-effort (never blocks the save).
- **Task filter "NOT IN THIS LIST".** When editing a checklist, a dynamic
  `'notinthis'` usage filter appears showing all tasks except those already in
  the current checklist — allowing tasks already used elsewhere to be added.
  Defaults to `'notinthis'` when opening a checklist for editing.
- **One-day activation + audiences.** `Checklist.activatedOn` (venue-local date)
  is set by ACTIVATE NOW (`POST /api/admin/checklists/[id]/activate`) — the list
  shows for the rest of the local day then self-expires (no cron; next day
  doesn't match). `ChecklistAudience` rows (DEPARTMENT/SECTION/POSITION) scope a
  list; a list with no audiences keeps the legacy department scoping. The
  gated-lists panel with ACTIVATE/DEACTIVATE lives on the Execution → TASKS page.
  Note: the audience editor is API + resolver only — not surfaced in the UI yet.

### Section ecosystem (Phases A–D, built)
A layer between department and the work, plus a follow-up trigger loop. The
legacy `TrainingModule`-based "Resources/Competency" pieces below are
**superseded by Guides** (see "Playbook Guides") — the models survive only so
old deployments can migrate.

- **Sections** — `Section` (under `Department`; denormalised `venueId`). `Task.sectionId`
  + `TaskSection` (a task can cover several sections; a section implies its
  department — enforced in the task API). `Staff ⇄ Section` many-to-many
  (`StaffSection`). CRUD at `/admin/sections`; section pickers on the Task and
  Staff forms; rendered on the structure tree.
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
- **Worker**: Custom JWT in an HTTP-only cookie (`hospo-worker-session`). Minimal — just stores staffId, venueId, and expiry. Auto-logout after 15 minutes of inactivity (client-side timer + server-side JWT expiry).

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
`00d2` pathways, `00d3` pathway nodes, `00d4` events/BEO, `00d5` event templates.

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

### Schema: 128 models (as of 2026-10)
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
reads the new column.

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

### WooCommerce Webhook (`/api/webhooks/woocommerce`)
Receives `order.created` / `order.updated` AND `product.created` / `product.updated` / `product.deleted` (branched on `x-wc-webhook-topic`). HMAC-SHA256 signature auth. Echo guard: pushes stamp `_updated_by: hospo-ops` + `_hospo_ops_pushed_at`; `isSelfEcho()` (lib/woo-push.ts) skips webhooks arriving within 2 min of our own push — genuine later edits still sync. Orders: upserts `WooOrder` + `WooOrderItem` in transaction, runs `explodeRecipe` per line item, stores exploded ingredients as JSON on order items. Products: `upsertProductFromWoo()` / soft-delete on `product.deleted`. Auto-seating engine: greedy first-fit bin-packing on partySize → `CalendarEvent` → `FloorPlanSetup` → `SetupItem` → `TableGroup`. Every event logs to `SyncLog`.

### Two-Way Sync (built 2026-07, refined 2026-07)

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
- **Sync dashboard:** `/admin/settings?tab=sync` (`SyncClient`) — PULL PRODUCTS / PULL ORDERS / PUSH PRODUCTS NOW buttons (`POST /api/admin/sync/pull|pull-orders|push`), live `SyncLog` feed (`GET /api/admin/sync/log`, 10s auto-refresh, direction/status filters, errors in red). `/admin/sync` redirects here.

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/woocommerce/categories` | GET | Returns all WooCommerce categories for the venue's store (used by the category picker in both the recipe editor and menu items) |
| `/api/admin/orders` | GET, POST | Orders for a service date (4 fixed queries, all four views) / create a manual order |
| `/api/admin/orders/[id]` | PATCH, PUT, DELETE | Lifecycle + fields / replace line items / soft-delete |
| `/api/admin/menus` | GET, POST | List/create menus |
| `/api/admin/menus/[id]` | GET, PUT, DELETE | Menu CRUD; PUT diffs the item set |
| `/api/admin/order-views` | GET, POST | Saved order-page views |
| `/api/admin/order-views/[id]` | PUT, DELETE | Saved view CRUD |

### Internal Cron Scheduler (`instrumentation.ts` + `lib/internal-cron.ts`)
Started once on server boot via Next's `instrumentationHook` (enabled in next.config.mjs). Minute tick; pure `dueJobs(state, now, tz)` decides what fires (Vitest-covered). Jobs: product pull every 15 min (`runProductPull`), order pull every 15 min (`runOrderPull`), expiry scan daily 03:00 in `DEFAULT_TIMEZONE` (`runExpiryScan` in `lib/expiry-scan.ts`). Fully self-contained — no host crontab. Disable with `INTERNAL_CRON=false`. Dev hot-reload guarded via `globalThis.__hospoInternalCron`.

### Cron Endpoints (`/api/cron/`) — external scheduler fallback
- `woocommerce-sync`: thin wrapper over `runProductPull()`
- `woocommerce-orders-sync`: thin wrapper over `runOrderPull()`
- `expiry-scan`: thin wrapper over `runExpiryScan()` — sweeps expired `InventoryItem`s, traces BOM to parent WooCommerce products, applies `fallbackCategoryId`
- All authenticated via `Authorization: Bearer <CRON_SECRET>` header

### Menus, serves & COGS (built 2026-08/09)

**Product serves** — `MenuItemServe` + `ServeMethod` (`MADE | DRAUGHT |
POURED | BOTTLED | WINE | OTHER`) is the product's POS/reporting spec: exactly
one target (`recipeId` XOR `inventoryItemId`), `qty` + `uomId`, label ("400ML").
Serves live on the **product**, not per menu, because SwiftPOS sales attribute
to the product. `lib/menu-serves.ts` (10 tests) validates one target / qty > 0 /
unit-kind consistency; `/api/admin/menu-items/[id]/serves` GET/PUT (PUT replaces
the set). Editor `MenuItemServesEditor` inside ITEM LINKS.

**Menu builder** — `/admin/ops?tab=menu&sub=menus` (`MenusClient` +
`MenuBuilder` / `MenuLineEditor` / `MenuPreview`): groups + drag-reorder lines,
product **and stock** lines (polymorphic `MenuMenuItem`: `menuItemId` XOR
`inventoryItemId`), per-line min/max, stock `sizeOptions`, live plain-text
preview. A menu **is** a WooCommerce category (`Menu.wooCategoryId`; contract
`'__new__'` match-or-create / `''` local-only / numeric id). `lib/menu-lines(.server).ts`
(9 tests) is the single read shape (`shapeMenuLine`; purged targets render
REMOVED). `lib/menu-sync.ts` (9 tests) keeps `MenuItem.wooCategoryId` = the
union of its live menus' categories and only pushes when it actually changed.

**COGS** — `lib/menu-cogs.ts` (8 tests, pure): `costPrice` is per ONE stock
`unit`; `costExploded` converts to grams via the density bridge;
`lib/menu-cogs.server.ts` `cogsForMenuItems(ids)` is lazy + batched, and marks
`partial: true` (UI renders `~`) when an ingredient has no cost. Shown per menu
row via `POST /api/admin/menus/cogs` and in `MenuLineEditor` vs ex-GST price
(`priceExGst`, `grossMarginPct`).

**Product sizes** — pushed to Woo as variations (`PUT /api/admin/menu-items/[id]/sizes`
merges by name so `wooVariationId` survives).

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
+ print. ⚠️ Known bug: the client POSTs to `/api/worker/giftcards/issue`, which
does not exist (the issuer is `POST /api/worker/giftcards`) — verify before
relying on it.

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

### EOD Reconciliation (`/api/admin/inventory/reconcile`)
Aggregates exploded ingredients from completed orders, tallies `requiredBaseQty` per inventory item. Returned as reconciliation report. Deferred inventory deduction (Phase 5).

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
- **Recipes: Woo imports moved behind a popup.** The recipe list only shows
  local recipes; `⬇ IMPORT PRODUCTS (n)` opens a modal of Woo-synced products
  with missing fields flagged red (`lib/recipe-import.ts` `missingProductFields`).
  Picking one opens the new-recipe editor pre-filled (existing `populateOrphan`).
- **Product detail fields + equipment links.** `MenuItem.tastingNotes`,
  `vintage`, `howToServe` + `MenuItemInventoryItem.qty/note/deletedAt` (the
  long-orphaned model is now live). Edited from the Recipes page ITEM LINKS
  block and from a menu line via PRODUCT INFO (`MenuItemDetailsModal` +
  `MenuItemEquipmentEditor`, routes `GET/PUT /api/admin/menu-items/[id]/equipment`).
  Product-reference tables gain derived MENU_FIELD columns TASTING_NOTES /
  VINTAGE / HOW_TO_SERVE / EQUIPMENT (defaults updated).
- **Guide-level PDF + external URL.** `Guide.pdfPath` (uploaded via
  `POST /api/admin/guides/[id]/attachment`, merged into the guide PDF download)
  and `Guide.pdfUrl` (external link). Both surface in the admin editor and the
  worker/admin reader (`GuideReaderContent`).
- **Gift-card live preview in a chrome-free viewer.** `POST
  .../gift-card-templates/[id]/preview` accepts `values` so the issue popup
  previews the data being typed (debounced). All gift-card previews render in
  `components/ui/PdfCanvasViewer` (pdf.js, no toolbar; scroll, ctrl+wheel
  zoom, drag-pan; worker at `public/pdf.worker.min.mjs`, copied by
  `scripts/copy-pdf-worker.mjs` on predev/prebuild). New dep: `pdfjs-dist`.
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
- **Training STATUS tab + board.** `TRAINING_TABS` gains STATUS;
  `TrainingStatusClient` shows every active staff member's required/missing/
  stale-guide counts and open follow-ups as GREEN (good) / YELLOW (bits to
  work on) / RED (retraining or overdue), grouped ON SHIFT TODAY then NOT ON
  SHIFT. Data from `GET /api/admin/training/status` backed by
  `lib/training-status.server.ts` (pure rules + sort in
  `lib/training-status.ts`). Managers get a TRAINING STATUS → button on the
  worker `/w/guides` header.
- **Notices grouping.** Worker notices split into PINNED (top) / unread /
  READ / ACKNOWLEDGED (bottom group) via `lib/notice-groups.ts`.
- **Drag-reorder lists.** Guide steps reorder by drag or ↑/↓ in both editors
  (admin `GuidesClient`, worker `WorkerGuideEditor`).

## FUTURE INTEGRATION STUBS

| Stub | Location | Phase |
|---|---|---|
| Passkeys / WebAuthn login | Admin + worker login upgrade (alongside email/password + PIN) | 2 |
| SwiftPOS staff sync | `Staff.swiftPosId` field | 2 |
| Push notifications | Not yet wired | 2 |
| S3 file uploads | `UPLOAD_PROVIDER=s3` env var stub | 2 |
| Inventory delete protection | API check against ElementInventoryItem + StocktakeLineItem | 2 |
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
> tasks), and SwiftPOS sales/drawdown reporting.

## TESTING

Every code change that touches component logic or hooks MUST include a Vitest
regression test. No test, no merge.

**Stack:** `vitest` + `@testing-library/react` + `jsdom`
**Config:** `apps/web/vitest.config.ts`, setup via `apps/web/vitest-setup.ts`
**Location:** test files live alongside components (e.g. `FloorPlanEditor.test.tsx`
next to `FloorPlanEditor.tsx`).
**Scale (2026-10):** ~175 test files / ~1,600 cases across `lib` and components.

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
```bash
npm run lint && npm run test
```
If either fails, the GitHub Actions CI pipeline (`docker-build.yml`) will also fail
and the Docker image won't be built. Broken code never ships.

## TEST COVERAGE

Every new pure function or hook-bearing component MUST have a corresponding
`*.test.ts` (lib) or `*.test.tsx` (component) file alongside it. Before
pushing, run: `npm run lint && npm run test`.

### Lib Files

| Target | Coverage |
|---|---|
| `lib/array.ts` — `moveItem` | ✅ |
| `lib/booth-trace.ts` — `traceBoothPerimeter` | ✅ |
| `lib/breaks.ts` — `nzBreakEntitlement`, `shiftHours`, `formatBreaks` | ✅ |
| `lib/budget-math.ts` — `generateDailyBudgetsNormalized`, `computeBreakdowns` | ✅ |
| `lib/dashboard-widgets.ts` — registry, `parseDashboardLayout`, `moveWidget`, `visibleWidgets` | ✅ (6 tests) |
| `lib/training-status.ts` — `trainingLevel`, `sortTrainingRows` | ✅ (5 tests) |
| `lib/notice-groups.ts` — `groupWorkerNotices` | ✅ (4 tests) |
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
| `lib/worker-session.ts` — `workerCookieSecure` | ✅ |
| `lib/followups.ts` — `checkUntrainedOnCompletion` (reads `TaskGuide`) | ✅ (5 tests) |
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
| `lib/order-views.ts` — `aggregateDishTotals`, `aggregateCategoryTotals`, `collectAllergenAlerts`, `groupByTable`, `groupByTimeSlot`, `summarise`, `applyFilters` | ✅ (34 tests) |
| `lib/order-booking-link.ts` — `findBookingForOrder`, `autoLinkBooking` | ✅ (11 tests) |
| `lib/beo-blocks.ts` — `BEO_BLOCKS`, `blockDef`, `normaliseConfig`, `stripBoundFields`, `makeBlock`, `moveBlock` | ✅ (32 tests) |
| `lib/beo-links.ts` / `beo-pdf.ts` — link grouping / BEO PDF variants | ✅ (8 + 11) |
| `lib/event-flow.ts` / `event-pricing.ts` / `event-share.ts` | ✅ (6 + 10 + 8) |
| `lib/service-schedule.ts` / `service-windows.ts` / `service-seating.ts` | ✅ (19 + 20 + 11) |
| `lib/availability.ts` / `availability.server.ts` — window algebra + plan→execute | ✅ (59 + 18) |
| `lib/roster-math.ts` / `roster-pdf.ts` / `staff-rate.ts` | ✅ (14 + 2 + 5) |
| `lib/nz-payroll.ts` / `payroll.ts` — PAYE/ACC/KiwiSaver engine + payrun bridge | ✅ (26 + 6) |
| `lib/food-safety.ts` — verdicts, GFMP defaults, health metrics | ✅ (37 tests) |
| `lib/unit-convert.ts` — grams canonicalisation + UOM kind helpers | ✅ (37 tests) |
| `lib/ingredient`/`llm-prompt.ts` — density prompt build/parse | ✅ (8 tests) |
| `lib/menu-cogs.ts` / `menu-lines.ts` / `menu-serves.ts` / `menu-sync.ts` | ✅ (8 + 9 + 10 + 9) |
| `lib/gift-card-numbers.ts` / `gift-card-template.ts` / `gift-card-history.ts` / `gift-cards-woo.ts` / `gift-cards.ts` | ✅ (10 + 16 + 3 + 8 + 9) |
| `lib/guide-pdf.ts` / `guide-types.ts` / `guide-folders.ts` / `guides.server.ts` / `guide-media.ts` | ✅ (13 + 4 + 7 + 3 + 6) |
| `lib/reference-table.ts` — derived MENU_FIELD columns + sanitisation | ✅ (19 tests) |
| `lib/rich-text.ts` — `sanitiseRichText` allowlist | ✅ (13 tests) |
| `lib/checklist-activation.ts` — venue-local date activation | ✅ (6 tests) |
| `lib/position-requirements.ts` — required guides + readiness resolver | ✅ (6 tests) |
| `lib/staff-groups.ts` — derived position grouping | ✅ (14 tests) |
| `lib/permissions/registry.ts` — `PERMISSION_TREE`, presets, `completeGrantSet` | ✅ (16 tests) |
| `lib/image-annotations.ts` / `image-thumb.ts` | ✅ (24 + 4) |
| `lib/tips.ts` / `swiftpos.ts` / `woo-pairing.ts` / `woo-oauth.ts` / `woo-categories.ts` | ✅ (tested) |
| `lib/video-transcode.ts` / `download-file.ts` / `pdf-safe.ts` / `geo.ts` | ✅ (2 + 4 + 4 + tested) |
| `lib/woo-push.ts` — `mapStatusToWoo`, `buildProductPushPayload` (images, categories, variable products), `pushVariationPrices`, `isSelfEcho` echo guard | ✅ |
| `lib/woo-sync.ts` — `runProductPull`, `upsertProductFromWoo`, `fetchWooCategories`, `fetchProductVariations` | ✅ |
| `lib/internal-cron.ts` — `dueJobs`, `localParts` (scheduler due-checks) | ✅ |
| `lib/auth.ts` — `authOptions` | ⬜ TODO |

### Component Regression Tests

| Target | Coverage |
|---|---|
| `FloorPlanView.test.tsx` — useMemo callback guard (React #310) | ✅ |
| `FloorPlansClient.test.tsx` — renders with ADMIN/MANAGER roles | ✅ |
| `AdminNav.test.tsx` — renders nav groups | ✅ |
| `FloorPlanEditor.tsx` — 30+ hooks, useMemo, loading gate | ✅ |
| `BudgetPageClient.tsx` — useCallback + useEffect chain | ✅ |
| `PdfCanvasViewer.tsx` — pdf.js viewer source + error fallback | ✅ (1 test) |
| `BudgetLinesPanel.tsx` — tree render, totals, add/import flows | ✅ (5 tests) |
| `BudgetImportModal.tsx` — parse preview, include toggles, commit | ✅ (4 tests) |
| `CalendarClient.tsx` — 22 useState | ✅ |
| `WorkerTasksClient.tsx` — dual early-return paths | ✅ |
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
| `WorkerGuidesClient.tsx` — BIBLE / MY TREE, folder grouping, edit gating | ✅ (11 tests) |
| `EventBuilder.tsx` / `PipelinePanel.tsx` / `EnquiriesPanel.tsx` — BEO builder, pipeline board, intake | ✅ (5 + 2 + 4) |
| `AvailabilityBar.tsx` / `AvailabilityDayEditor.tsx` / `WorkerAvailabilityClient.tsx` / `AvailabilityAdminClient.tsx` | ✅ (4 + 7 + 5 + 8) |
| `RosterClient.tsx` / `ClocksClient.tsx` / `PayrollClient.tsx` | ✅ (7 + 5 + 4) |
| `StaffAccessDrawer.tsx` / `OpsClient.tsx` / `MenusClient` builder components | ✅ (4 + 7 + tested) |
| `EventShareClient.tsx` / `WorkerEventsClient.tsx` / `WorkerTimeclockClient.tsx` | ✅ (4 + tested) |
| `ImageAnnotator` / `ImagePicker` / `AnnotatedImage` / `MediaLibraryModal` / `Panel` / `Combobox` | ✅ (co-located tests) |

## PRE-COMMIT CHECKLIST

When the user signals intent to commit and test (e.g. "I'm going to commit",
"time to push", "ready to test on live", "let's ship this"):

1. **Run the quality gates:** `npm run lint && npm run build && npm run test`
   - Lint: 0 errors expected (warnings are ok if pre-existing)
   - Build: must compile all pages
   - Tests: all passing (8 `@hospo-ops/db` failures in local vitest are a known
     monorepo issue — they pass in CI with turborepo)

2. **Offer to prebuild the Docker image** so GitHub Actions only runs lint+test
   as a gate, skipping the slow Docker build. Run `build-and-push.ps1` (gitignored)
   if the user wants to push directly to GHCR. (Requires Docker running + GHCR login.)

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

5. **GitHub Actions CI** — remind the user of the workflow fixes if relevant
   (Prisma generate step, turbo test command). If the workflow file was changed
   in this session, flag it.

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
