# HOSPO OPS — AI CODING CONTEXT

HOSPO OPS is a self-hosted hospitality ERP and operations platform. It manages venues, staff, tasks, inventory, recipes, floor plans, budgets, and WooCommerce integration with auto-seating, recipe explosion, and inventory deduction.

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
| Testing | Vitest 3 + @testing-library/react + jsdom |
| Linting | ESLint 9 (flat config) + eslint-config-next 15 |

## MONOREPO STRUCTURE

```
hospo-ops/
├── apps/
│   └── web/                        # Next.js app (admin + worker UI)
│       ├── app/
│       │   ├── page.tsx            # / — split-screen landing (worker link + admin login)
│       │   ├── admin/
│       │   │   └── (protected)/    # Auth-gated admin routes (/admin/*)
│       │   │       └── floorplan/  # Floor plan editor (/admin/floorplan)
│       │   ├── w/
│       │   │   ├── (authenticated)/# PIN-gated worker routes (/w/*)
│       │   │   │   └── floorplan/  # Worker floor plan view (/w/floorplan)
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
│   ├── db/                         # Prisma 7 schema + PG adapter + seed
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # 52 models (core + ERP)
│   │   │   └── migrations/
│   │   ├── prisma.config.ts        # Prisma 7 config (datasource, seed)
│   │   └── index.ts                # Exported Prisma client (global singleton, PG pool)
│   ├── types/                      # Shared TypeScript types/interfaces
│   └── config/                     # Lightweight package (tailwind.config.ts migrated to CSS @theme)
├── .github/workflows/
│   └── docker-build.yml            # CI: builds image, pushes to GHCR
├── apps/web/Dockerfile             # Single-stage image (build + runtime)
├── apps/web/docker-entrypoint.sh   # Runs db push + seed, then `next start`
├── docker-compose.yml              # Canonical stack — PULLS image from GHCR
├── .env.example                    # Env template for compose / Portainer
├── start.ps1                       # Local dev launcher (kills stale processes, starts Postgres, syncs DB, starts dev)
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
- Admin: `admin@demo.com` / `admin1234`
- Bar Manager: `bar@demo.com` / `bar1234`
- Kitchen Manager: `kitchen@demo.com` / `kitchen1234`
- FOH Manager: `foh@demo.com` / `foh1234`

Worker QR+PIN logins remain `0000` / `1111` / `2222` / `3333`.

**Migration:** earlier builds stored the login email in `swiftPosId` and used the
PIN as the password. The seed backfills `email`/`password` from those for any
existing ADMIN/MANAGER (and frees `swiftPosId`), so no one is locked out.

### Playbook Guides (Phase 6 — replaces Training)

`Guide` + `GuideStep` replace the old `TrainingModule`/`TrainingStep` system.
Steps are simplified — just `heading`, `content`, `imageUrl`, and `videoUrl`. All
step-level junction tables (StepInventoryItem, StepTask, StepModule,
linkedChecklistId, linkedTaskId on step) have been removed.

A guide has:
- `status`: `DRAFT` | `PUBLISHED` — new guides start as DRAFT and must be
  explicitly published before workers can see them. No guide ever goes live by
  accident.
- `isTracked: boolean` — replaces the old `kind` enum. When true, the guide shows
  in the worker's "My Guides" list, tracks completions, and supports sign-off and
  onboarding. When false, it's a reference-only document (old SOP/FAQ/HOWTO).
- `requiresSignOff: boolean` — when true, a manager must sign off via the Staff
  page modal. When false, the worker self-completes.
- `isOnboarding: boolean` — applies to ALL staff regardless of department.
- `departmentId: String?` — auto-applies to all staff in that department.

A guide applies to a person when any of:
1. `isOnboarding: true` (all staff)
2. `departmentId` matches staff's department
3. Individually assigned via `GuideAssignment` (with `reason` for upskill/areas to
   work on)

**Task linking** is done via `TaskGuide` — a single junction with
`isRequiredForCompetency: boolean`. When true, completing this guide is a
**competency requirement** before the task can be performed. When false, the
guide is a how-to reference for the task. Both are set from the guide form and
the task edit form.

**Completion** is tracked in `GuideCompletion` (`@@unique([guideId, staffId])`).
`selfCompleted: true` for worker self-complete; `signedOffById` for manager
sign-off. Revoke hard-deletes the row.

**Admin authoring** at `/admin/guides` (`GuidesClient`) — grid of guide cards
with DRAFT/PUBLISHED badges, PUBLISH button per card. Form has title,
description, category, department, linked tasks + competency tasks comboboxes,
isTracked/requiresSignOff/isOnboarding checkboxes, and steps (heading, content,
video, photo upload). PUBLISHED guides are visible to workers; DRAFT guides
are sandboxed and used only for staging.

**Staff management** via Staff page → GUIDES button → `StaffGuidesModal` —
shows all applicable guides per staff member with completion status, MARK
TRAINED (sign-off), REVOKE, UNASSIGN actions, and ASSIGN section with reason
input.

**Worker view** at `/w/guides` (`WorkerGuidesClient`) — progress bar, list of
applicable guides, full-screen step-by-step reader with photos and videos,
MARK COMPLETE button (self-complete, blocked if sign-off required),
MANAGER SIGN-OFF message when appropriate. Dashboard widget shows % complete.

**API routes:**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/guides` | GET, POST | List/create guides |
| `/api/admin/guides/[id]` | GET, PUT, DELETE | Single guide CRUD |
| `/api/admin/guides/[id]/publish` | PATCH | Toggle DRAFT ↔ PUBLISHED |
| `/api/admin/guides/complete` | POST, DELETE | Sign-off / revoke |
| `/api/admin/guides/assign` | POST, DELETE | Assign / unassign |
| `/api/admin/staff/[id]/guides` | GET | Staff's applicable guides + completions |
| `/api/worker/guides` | GET | Worker's applicable guides + completion status |
| `/api/worker/guides/[id]/complete` | POST | Self-complete (rejects sign-off-required) |

**Migration:** `packages/db/prisma/migrate-to-guides.ts` reads old
`TrainingModule`/`TrainingStep` data, creates `Guide`/`GuideStep`/`TaskGuide`
rows with `status: 'DRAFT'`, flattens `StepInventoryItem` into
`legacyToolsNote`, drops step-level junctions. Idempotent — runs in `start.ps1`
and skips if guides already exist. Old tables left intact for reference.

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
`Shift` (per-staff, per-date, `startTime`/`endTime` as local "HH:mm" strings) and
`TimeOffRequest` (date range, `TimeOffStatus` PENDING/APPROVED/DECLINED) drive a
month calendar. `/api/admin/calendar?year=&month=&venueId=` returns a per-day map
of shifts + time-off + a `dutiesRequired` flag (computed from task schedules via
`isTaskDueOnDate`). Admin manages shifts (`/api/admin/shifts`) and approves
requests (`/api/admin/timeoff/[id]` PATCH) at `/admin/calendar`. Staff see their
own upcoming shifts and request/cancel time off at `/w/calendar`
(`/api/worker/calendar`, `/api/worker/timeoff`). Times are local strings (no tz
math); dates are @db.Date keyed via `formatDateKey`. `lib/calendar.ts` has the
month/range/time-validation helpers.

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

**Admin page:** `/admin/bookings` — time-grid diary view (06:00–24:00 in
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

**Backup/export:** `GET /api/admin/backup` streams a tar.gz containing `data.json` (all
venue-scoped models, active and soft-deleted) plus `uploads/` files. `GET /api/admin/seed-export`
returns a SQL-like dump of active venue data for seeding new instances. Both exclude demo venue
data and are admin-only.

**Customer database:** `/admin/customers` — searchable table by phone or name, detail popup
with contact info and booking history per customer. Customers are identified by phone number
as the lookup key; past bookings show status, date, party size, and tables.

### Floor planner (Phase 1 + 2, built)
To-scale venue layout editor using **PixiJS v7** canvas (migrated from Konva 2026-06 — Konva's
draggable+React caused unresolvable event target and race condition bugs). Admin creates floor
plans with room dimensions (real cm). Elements are drawn using drawing modes (WALLS, DRAW BOOTH,
SECTIONS) directly on the canvas. Tables are created and managed from the **inventory module**
(`/admin/inventory` → FURNITURE/TABLES category), not from a drag palette. Elements are drawn
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

**Custom painted booths (DRAW BOOTH):** Toolbar toggle shifts the canvas into a paint mode.
User clicks and drags to paint 50×50cm grid squares (blue preview at 30% opacity); Shift+drag
erases. On "SAVE SHAPE", `lib/booth-trace.ts` uses `polygon-clipping` to union all painted cells
into a single outer perimeter, then `polygon-offset` to shrink by 8cm for the cushion inset
polygon. The result is saved as a `BOOTH_BENCH` element with `shape: 'POLYGON'`, outer vertices
and cushion vertices stored in the element's `vertices` and `style.cushionVertices`. Rendered
in PixiJS with the outer polygon as solid fill and the cushion as a transparent stroked inner
shape. Labels drawn at the polygon centroid. Existing golden dashed bench connectors work
automatically (same `servedTableIds` logic).

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
references a `TableProfile`. Setups are saved independently via `PUT /api/admin/floorplan/[id]/setups/[setupId]/items`.

**Table Profiles (Bill of Materials):** A `TableProfile` defines a table type (e.g. "8-SEAT ROUND",
"BANQUET 25") with dimensions, colour, `chairCount`, `seatingDensity` (cm per chair), and
`maxHeadChairs` (caps chairs on short edges). Each profile has a BOM via `TableProfileItem` —
linking to `InventoryItem` records with `quantity` and a `perChair` toggle (per-chair items
scale with seat count, per-table items don't). Profiles also carry `tableNumbers` (physical
identifiers like `["20","21","22"]`) for auto-assignment.

**Setup Editor:** `FloorPlanEditor.tsx` has been extended with a setup toolbar (switcher
dropdown, +NEW, DELETE, GROUP/UNGROUP buttons). When a setup is active, placing tables
from Table Profiles is done via the canvas — existing tables are created through the
inventory module (`/admin/inventory` → TABLES category), added to plans as `SetupItem`
records. Available/pool
counts are shown as badges (`3/5`). Canvas rubber-band selection works for setup items.

**Magnetic Edge Snapping + auto-join:** When a `SetupItem` is dragged close to another
same-profile item, the canvas detects edge proximity (parallelism, distance, facing, overlap)
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
API layer — all items must share the same `TableProfile`. Grouped tables get gold dashed
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
| `/api/admin/table-profiles` | GET, POST | List/create table profiles |
| `/api/admin/table-profiles/[id]` | GET, PUT, DELETE | Single profile CRUD |
| `/api/admin/table-profiles/[id]/bom` | GET, PUT | BOM item management |
| `/api/admin/floorplan/[id]/setups` | GET, POST | List/create setups |
| `/api/admin/floorplan/[id]/setups/[setupId]` | GET, PUT, DELETE | Setup CRUD |
| `/api/admin/floorplan/[id]/setups/[setupId]/items` | PUT | Bulk save setup items |
| `/api/admin/floorplan/[id]/setups/[setupId]/groups` | GET, POST | List/create groups |
| `/api/admin/floorplan/[id]/setups/[setupId]/groups/[groupId]` | GET, PUT, DELETE | Group CRUD |
| `/api/admin/floorplan/[id]/section-boundaries` | GET, PUT | Section boundary CRUD |
| `/api/worker/floorplan/setups` | GET | Worker setup list |
| `/api/worker/floorplan/setups/[id]` | GET | Worker setup detail |
| `/admin/table-profiles` | page | TableProfile management UI |

**Worker View:** `WorkerFloorPlan` has been extended with a setup switcher dropdown (alongside
the existing view switcher). Workers can switch between the base plan and any setup. Setup
items render on the read-only canvas with auto-assigned numbers as labels. A setup banner
shows the active setup name.

**Interactive overhaul (2026-07):** the setup layer became the single interactive table layer
and the loop was closed end-to-end:
- **Direct-manipulation editing** — select a `SetupItem` to delete (Delete key / panel), rotate
  (on-canvas drag handle + preset buttons), and set chairs by **clicking table edges** (left =
  add, right = remove) up to capacity/head caps. Per-edge counts live in `SetupItem.chairEdges`
  (`Json?`); `lib/floorplan-chairs.ts` holds the pure `adjustEdgeChairs` / `defaultEdgeChairs` /
  `maxChairsForEdge` logic.
- **Auto-join on proximity** (see Magnetic Edge Snapping above) with grouped-move.
- **Merged-group rendering** — grouped tables draw one union outline (`unionTablePolygons`) with
  chairs redistributed evenly (`computeGroupChairs`) instead of N separate rectangles.
- **Live per-area totals** and **section auto-tagging via zones** (see Section detection above).
- **Two-layer UX** — while a setup is active the base plan dims + locks (`baseLayer.eventMode
  = 'none'`) and base-only tools (SECTIONS / DRAW BOOTH) hide; a "BASE PLAN LOCKED" note shows.
- **Fixes** — undo/redo now snapshots `{ elements, setupItems, zones }`; stale room-dimension
  closure in the Pixi init effect fixed; the dead Konva `FloorPlanElementVisual` renderer removed.

**WALLS drawing mode:** Toolbar WALLS toggle activates a click-to-place wall mode. Each click
places a wall anchor point; points connect as thick grey segments (`WALL` elements with
`shape: WALL_POINT`). Double-click or pressing Escape finishes the wall polyline. Existing walls
still render as styled thick lines with toggleable labels. Wall point elements are stored with
`vertices` arrays recording the anchor positions; the canvas renders them as connected polygons
with rounded joints.

**Polygon section zones:** SECTIONS mode supports two drawing methods — rectangle drag (existing)
and freeform polygon. POLYGON toggle in the zone palette switches to click-to-place polygon
vertices; double-click closes the shape. Polygons use `pointInPolygon` (ray-casting) for
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

**Vitest Coverage:** 232 tests across 31 files. `lib/floorplan-inventory.test.ts` has 49 tests
covering `calculateSetupInventory`, geometry helpers, `computeGroupChairs`,
`computeEffectiveChairs`, `computeSetupSectionTotals`, `pointInPolygon`, and BOM integration.
`lib/floorplan-chairs.test.ts` (11) covers per-edge chair logic and `lib/auto-seat.test.ts` (7)
covers the bin-packing planner. `TableProfilesClient.test.tsx` (10) and `SetupInventoryPanel.test.tsx`
(7) cover the new components.

### Inventory + stocktake (Phase 2, built)
Full inventory management system: `InventoryCategory` (8 built-in including FURNITURE + per-venue custom) and
`InventoryItem` (venue-id-scoped, links to category, tracks unit, par level, and `totalQty` — physical stock count).
`ElementInventoryItem` junction links items to floor plan elements with quantity.
`StocktakeRecord` + `StocktakeLineItem` for periodic stock counts.

**Stock-aware tracking:** `InventoryItem.totalQty` is the physical count of items owned. The
`GET /api/admin/inventory` route returns `placedCount` (from `_count.elements`) so the UI can
compute `availableQty = totalQty - placedCount` per item.

**Admin pages:** `/admin/inventory` has a master-detail layout — left column (vertical CATEGORIES
nav + INVENTORY SUMMARY tree), right column (item list with real AVAIL column + compact PROPERTIES
form in a CSS grid). Dynamic headers (`FURNITURE STOCK`/`STANDARD STOCK`) and buttons
(`+ ADD TABLE`/`+ ADD ITEM`) based on the selected category. Items can be edited (PUT route)
and duplicated. `/admin/stocktake` (create/assign/review/sign-off) with variance tracking.
(create/assign/review/sign-off). Dashboard par level alerts.

**Worker page:** `/w/stocktake` — scrollable count list, submit IN_PROGRESS or COMPLETED.
Dashboard stocktake card with pending count. Hamburger menu entry.

**AdminNav:** Inventory under Organisation, Stocktake under Operations.

**Equipment & tool tracking (Phase 5):** `InventoryItem` has new fields for
physical asset management:
- `imageUrl` — photo of the item
- `storageSectionId` — FK to `Section` (where the item lives)
- `storageNotes` — e.g. "TOP SHELF, ABOVE THE COFFEE STATION"
- `serialNumber` — equipment serial number
- `purchaseDate`, `warrantyExpiry` — procurement tracking
- `serviceIntervalDays`, `lastServicedAt`, `nextServiceAt` — maintenance schedule
- `maintenanceNotes` — free-text service history
- `supplierId` — supplier for servicing/parts (existing FK)
These fields enable tracking tools, appliances, and equipment alongside
consumable stock. Items with a `storageSectionId` appear in the structure tree
under their section. Combined with `StepInventoryItem`, training/SOP steps can
reference the exact tools needed, showing staff the item photo, storage location,
and supplier details directly in the training view.

**Category visibility toggles:** `InventoryCategory.showDeepFields` and
`showEquipmentFields` control which form sections appear per category. FOOD and
BEVERAGE categories show DEEP INVENTORY (shelf life, freeze, costing); OTHER
and TABLES categories show EQUIPMENT TRACKING (photo, storage, maintenance).

**Deep inventory redesign:** FOOD/BEVERAGE item forms now use `shelfLifeDays`,
`canFreeze`, and `freezerShelfLifeDays` instead of a single expiry date. Unit
and Total QTY are hidden (replaced by Par Level). Fallback category has been
removed — deleted categories automatically unassign items. Shelf life fields:
`shelfLifeDays Int?`, `canFreeze Boolean`, `freezerShelfLifeDays Int?`.

**Table profiles in inventory:** Table Profile management has been merged into
the inventory under TABLES. The standalone `/admin/table-profiles` nav item
removed. Creating/editing tables opens a modal popup via `TableProfileForm`.

**Restore deleted items:** SHOW DELETED toggle in inventory displays soft-deleted
items with RESTORE (`POST .../restore`) and PURGE (`DELETE ?permanent=1`) buttons.

**Allergen management:** 23 allergens (Almond, Barley, Brazil Nut, Cashew, Crustacean,
Egg, Fish, Hazelnut, Lupin, Macadamia, Milk, Mollusc, Oats, Peanut, Pecan, Pine nut,
Pistachio, Rye, Sesame, Soy, Sulphites, Walnut, Wheat) managed via `AllergenPicker`
component with grouped buttons (DAIRY, NUTS, GRAINS, etc.). Allergens are stored as
comma-separated `dietaryInfo` on `MenuItem`. The `GET /api/admin/menu-items` endpoint
resolves inherited allergens by walking the recursive recipe BOM — a menu item shows
its own allergens PLUS any allergens from sub-recipes, with inherited ones locked (⚿)
and showing the source recipe in a popup. The recipe editor has a LINK TO MENU toggle;
linked products show up as inherited allergen sources.

**UOM conversion fields:** Deep inventory items have `countingUnitQty` (how many
base units make one counting unit), `orderingUnitQty` (how many base units make one
ordering unit), and `parLevelUnitId` (which unit the par level applies to). Units
of measure use a chain of `UnitOfMeasure` rows with `baseConversionRatio` for
standardised stock math.

**Alternative suppliers:** `InventoryItem.alternativeSupplierIds Json` holds an
ordered array of backup supplier UUIDs. The `SupplierItemCode` junction links each
supplier to an item with that supplier's SKU. The inventory form shows all linked
suppliers with their codes and supports reordering.

**Maintenance logs:** `MaintenanceLog` records service events per inventory item
with `notes`, `hoursAtService`, and `performedById`. Shown in a chronological log
in the item form. `nextServiceAt` auto-calculates from `lastServicedAt +
serviceIntervalDays` in hours.

**Photo paste-to-upload:** `imageUrls` is a JSON array of URLs. The equipment form
renders a photo gallery with paste-to-upload support (paste an image from clipboard
→ uploads to `/api/admin/upload` → appends URL). Photos can be reordered and
deleted individually.

**Restore deleted items:** SHOW DELETED toggle in inventory displays soft-deleted
items with RESTORE (`POST .../restore`) and PURGE (`DELETE ?permanent=1`) buttons.

### Calendar (roster + time off)
`GET /api/admin/stock/hierarchy` returns a Section → Table → Inventory Items tree in one query.
The Structure API (`GET /api/admin/structure`) extends with `floorPlan { tables, chairs, equip }`
per section.

### Unified staff identity
A single `Staff` profile carries external-system link IDs — `swiftPosId`,
`myHrId`, `loadedReportsId` — so one person maps across SwiftPOS, MyHR, and
LoadedReports. These are editable in the Staff form now; automated sync is a
future item (see ROADMAP). `email` doubles as a natural cross-system match key.

### Live structure map
`/admin/structure` (`StructureClient`) has two views, toggled by a **TREE / MAP** tab:

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

### Responsive admin nav
`AdminNav` renders a static sidebar on `md+` and, on mobile, a fixed top bar with
a burger button that opens an off-canvas drawer (closes on route change /
backdrop tap). The protected layout adds `pt-14 md:pt-0` so content clears the
fixed mobile bar.

### Checklists (live task references) + re-train
- **Merged Tasks + Checklists.** The old copy-based `TaskTemplate` is retired from
  the UI (`/admin/templates` → redirects to `/admin/tasks`). A `Checklist` is an
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
- **Checklist embedded in training.** `TrainingStep.linkedChecklistId` lets a
  training/SOP step embed a whole checklist; `getStaffTraining` returns the
  step's `linkedChecklist` (live task titles) and the worker reader shows them as
  an in-session tick-off list (a walkthrough aid — not the live daily
  `TaskCompletion`). Authored via a per-step dropdown in the Training editor
  (filtered to the module's department).
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
- **Grouped admin nav.** `AdminNav` renders collapsible groups (Overview /
  Organisation / Work / Daily ops / Finance + a standalone Settings); the active
  group auto-opens; the mobile burger drawer shares the same groups.

### Section ecosystem (Phases A–D, built)
A layer between department and the work, plus a follow-up trigger loop. Full
write-up in `ECOSYSTEM.md`; keep it in sync.

- **Sections** — `Section` (under `Department`; denormalised `venueId`). `Task.sectionId`
  (a section implies its department — enforced in the task API). `Staff ⇄ Section`
  many-to-many (`StaffSection`). CRUD at `/admin/sections`; section pickers on the
  Task and Staff forms; rendered on `/admin/structure`.
- **Resources** — `TrainingModule.kind` (`ResourceKind`: TRAINING | SOP | FAQ | HOWTO).
  `getStaffTraining` filters to `kind: 'TRAINING'` so SOP/FAQ/HOWTO are reference-only.
  `ResourceSection` (resource ⇄ section, sharable) and `ResourceLink` (resource ⇄
  resource). Authored on the Training page (kind selector + section attach).
- **Competency** — `TaskRequiredTraining` (`Task ⇄ TrainingModule` "requires"), set in
  the Task form; competency held = a `TrainingCompletion` for that module.
- **Triggers** — `FollowUp` (`FollowUpKind` MISSED | UNTRAINED | INCORRECT,
  `FollowUpStatus`, `@@unique([venueId, staffId, kind, taskId, dueDate])` for
  idempotency). `lib/followups.ts`: `checkUntrainedOnCompletion` (called from the
  worker complete route) raises UNTRAINED at completion; `generateVenueFollowUps`
  (run on the Follow-ups page load + RE-SCAN) raises MISSED for assigned tasks with
  required training and auto-assigns that training. Surface: `/admin/followups`
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
- `BudgetMonthSelector` — dual variant: `grid` (12-month 3×4 CSS grid + year toggle for `/admin/budget`) and `compact` (slim `[←] MON YEAR [→]` + `VIEW ALL MONTHS` button for `/admin/budget/[year]/[month]`). Venue selector at top, auto-defaults to first venue for admins.
- `BudgetSetupPanel` — 2-column dashboard: left = ALLOCATION (total budget, REVENUE locked at 100%, indented breakdown rows with department Select + `VENUE` option, auto-REMAINDER read-only row, progress bar); right = DAILY WEIGHTING (MON-SUN with 100% validation bar) + SUMMARY (TARGET/ALLOCATED/VARIANCE stats + GENERATE/SAVE/DELETE buttons). `↻ SYNC BREAKDOWNS` pushes categories to all venue months.
- `BudgetDailyGrid` — ISO week grouping into `lg:grid-cols-2` card grid. Week headers show date range + summed total. Single editable REVENUE input per day (no NOTE). Inline read-only breakdown text `BEV: $945 | REM: $2,205`. State lifted to parent — edits update `allocations` → stats recompute in SUMMARY panel.
- `BudgetPageClient` — state coordinator. Computes `budgetStats` from `allocations` state. Manages venue selection, API load/save/delete/generate/sync flows.
- `BudgetLandingClient` — client wrapper for landing page, fetches venues, renders grid variant.


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

## SEED DATA CONVENTIONS

When modifying the seed file (`packages/db/prisma/seed.ts`), follow these patterns:

### Demo venue architecture

A seeded **demo venue** (`Venue.isDemo: true`, id `00000000-0000-0000-00d0-000000000001`)
holds all sample data — departments, staff, tasks, checklists, training. The demo venue is
separate from real user data and can be disabled in **Settings → DEMO VENUE** (admin only).

| Area | Behaviour |
|---|---|
| Auth login | `authorize()` blocks MANAGER login when demo venue is disabled (`isActive: false`). ADMIN always logs in. `venueIsDemo` is stamped in the NextAuth JWT/session. |
| Write blocking | `middleware.ts` + `lib/demo-block.ts` (pure, tested) blocks non-GET requests to `/api/admin/*` for demo-venue managers (403 "read-only"). ADMIN bypasses. Workers (task completions etc.) are NOT blocked. |
| Sync isolation | `woo-sync.ts`, `woo-orders-sync.ts`, `webhook/woocommerce` filter integrations by `venue: { isDemo: false }`. `external-sync.ts` excludes demo venues. `expiry-scan.ts` skips demo-venue items. Woo settings PUT is blocked for demo venues. |
| Venue visibility | Disabled demo venues are hidden from `/api/venues` (worker picker), `/api/admin/venues` (admin switcher), and overdue tasks are filtered out (`NOT: { isDemo: true, isActive: false }`). |
| Seed lifecycle | Fresh install: demo created **active**. Existing install with real venues: demo created **disabled**. Legacy demo entities (old `...0001` prefix UUIDs) are auto-cleaned from non-demo venues on every seed run — staff are kept if their email was changed (repurposed account), otherwise soft-deleted with `email: null` to free the `@demo.com` email. The bootstrap admin (`...0020`) is NEVER touched and its credentials are NEVER reset on re-deploy (`update: {}`). |

New demo entities use UUID pattern `00000000-0000-0000-00d0-XXXXXXXXXXXX` (prefix `00d0`).
The helper `d(id)` in seed.ts generates these: `d('000000000020')` → demo admin staff UUID.

### Fixed IDs for reproducibility
Every seed entity uses a hardcoded UUID in the `00000000-0000-0000-XXXX-0000000000YY` pattern where `XXXX` is an entity-group prefix and `YY` is a zero-padded counter. This makes upserts idempotent and safe to re-run.

| Prefix | Entity |
|--------|--------|
| `0001` | Department tasks (daily) |
| `0002` | Department tasks (weekly) |
| `0010` | Departments |
| `0020` | Staff |
| `0030` | QR Codes |
| `00a0` | Task templates |
| `00b0` | Training modules |

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



- All primary keys: UUID `@default(uuid())`
- All tables: `createdAt`, `updatedAt`, `deletedAt` (soft delete)
- Enums: `SCREAMING_SNAKE_CASE`
- Task titles, venue/department names: stored and displayed in `UPPERCASE`
- UI labels, nav items, buttons: `text-transform: uppercase` via Tailwind/CSS
- API routes: `/api/admin/*` (admin) and `/api/worker/*` (worker)
- Components: `PascalCase.tsx`
- Client components: always marked `'use client'`

## ERP & WOOCOMMERCE (BUILT 2026-07)

### Schema: 53 models (43 core + 10 ERP)
New models: `Supplier`, `UnitOfMeasure`, `SupplierItemCode`, `Recipe`, `RecipeLineItem` (recursive BOM), `WooIntegration`, `MenuItem`, `WooOrder`, `WooOrderItem`, `SyncLog`. `@@unique([venueId])` on WooIntegration.

### Recipe Explosion Engine (`lib/inventory-engine.ts`)
Recursive BOM parser: walks `RecipeLineItem` tree, converts all quantities to base units via UOM conversion ratios, returns flattened `Map<inventoryItemId, requiredBaseQty>`. DAG-safe cycle detection via visited set. 5 Vitest tests with mocked PrismaClient.

### WooCommerce Webhook (`/api/webhooks/woocommerce`)
Receives `order.created` / `order.updated` AND `product.created` / `product.updated` / `product.deleted` (branched on `x-wc-webhook-topic`). HMAC-SHA256 signature auth. Echo guard: pushes stamp `_updated_by: hospo-ops` + `_hospo_ops_pushed_at`; `isSelfEcho()` (lib/woo-push.ts) skips webhooks arriving within 2 min of our own push — genuine later edits still sync. Orders: upserts `WooOrder` + `WooOrderItem` in transaction, runs `explodeRecipe` per line item, stores exploded ingredients as JSON on order items. Products: `upsertProductFromWoo()` / soft-delete on `product.deleted`. Auto-seating engine: greedy first-fit bin-packing on partySize → `CalendarEvent` → `FloorPlanSetup` → `SetupItem` → `TableGroup`. Every event logs to `SyncLog`.

### Two-Way Sync (built 2026-07, refined 2026-07)

**Pull (Woo → app):**
- `lib/woo-sync.ts` `runProductPull(venueId?)` — paginated product fetch, upserts `MenuItem`s, logs to `SyncLog`
- `upsertProductFromWoo()` stores category **names** (not IDs), downloads featured images to local uploads, and strips HTML from descriptions
- `fetchWooCategories()` fetches all product categories from the WooCommerce REST API — used by the category autocomplete dropdown in the admin UI
- `lib/woo-orders-sync.ts` `runOrderPull(venueId?)` — paginated order fetch, upserts `WooOrder` + `WooOrderItem`, runs recipe explosion, auto-seating, and gift card detection per order, logs to `SyncLog`

**Push (app → Woo):**
- `lib/woo-push.ts` — `pushProduct()` fires on every menu item / recipe menu-link save (name, price, category, and images → `PUT wc/v3/products/{id}`)
- **Auto-create on WooCommerce:** if the item has no `wooProductId` (new product) or the PUT returns 400/404 (product doesn't exist on Woo), `pushProduct()` POSTs to `wc/v3/products` to create it, then stores the returned WooCommerce product ID in the database
- **Images pushed:** `buildProductPushPayload` includes `images` when `imageUrl` is set
- **Category handling:** numeric `wooCategoryId` → `categories: [{ id }]`; non-numeric (name) → `categories: [{ name }]`
- `pushOrderStatus()` fires on order status change via `PATCH /api/admin/orders/[id]` (Orders page STATUS dropdown)
- All pushes best-effort: log to `SyncLog`, never throw, never block the save

**Auto-generated Woo Product ID:**
- When creating a menu item via POST (both `/api/admin/menu-items` and the recipe LINK TO MENU flow) without providing a `wooProductId`, the API queries `max(existing wooProductId) + 1` for the venue and auto-assigns it. This gives new products an ID to push with — the push then creates the product on WooCommerce if it doesn't exist yet.
- **Sync dashboard:** `/admin/sync` (`SyncClient`) — PULL PRODUCTS / PULL ORDERS / PUSH PRODUCTS NOW buttons (`POST /api/admin/sync/pull|pull-orders|push`), live `SyncLog` feed (`GET /api/admin/sync/log`, 10s auto-refresh, direction/status filters, errors in red).

### Internal Cron Scheduler (`instrumentation.ts` + `lib/internal-cron.ts`)
Started once on server boot via Next's `instrumentationHook` (enabled in next.config.mjs). Minute tick; pure `dueJobs(state, now, tz)` decides what fires (Vitest-covered). Jobs: product pull every 15 min (`runProductPull`), order pull every 15 min (`runOrderPull`), expiry scan daily 03:00 in `DEFAULT_TIMEZONE` (`runExpiryScan` in `lib/expiry-scan.ts`). Fully self-contained — no host crontab. Disable with `INTERNAL_CRON=false`. Dev hot-reload guarded via `globalThis.__hospoInternalCron`.

### Cron Endpoints (`/api/cron/`) — external scheduler fallback
- `woocommerce-sync`: thin wrapper over `runProductPull()`
- `woocommerce-orders-sync`: thin wrapper over `runOrderPull()`
- `expiry-scan`: thin wrapper over `runExpiryScan()` — sweeps expired `InventoryItem`s, traces BOM to parent WooCommerce products, applies `fallbackCategoryId`
- All authenticated via `Authorization: Bearer <CRON_SECRET>` header

### Inventory Tabs
`InventoryCategory.tab` (FOOD, BEVERAGE, null). 20 built-in categories auto-seeded. FOOD tab: PROTEIN, DAIRY, PRODUCE, DRY GOODS, BAKERY, CONDIMENTS. BEVERAGE tab: LIQUOR, WINE, BEER, SOFT DRINK, JUICE, COFFEE. OTHER tab: existing equipment categories. Deep inventory fields: `countingUnitId`, `orderingUnitId`, `yieldPercentage`, `costPrice`, `expiryDate`, `fallbackCategoryId`, `allergyInfo`.

### Recipes & Menu Items (combined page)
`/admin/recipes` merged with `/admin/menu-items` (redirects). Recipe editor has LINK TO MENU toggle with price + WooCommerce fields. Woo Category field is a searchable autocomplete dropdown populated from the WooCommerce store's categories via `GET /api/admin/woocommerce/categories` (fetched on page load). Woo Product ID is **read-only** — auto-generated as `max(existing) + 1` on create and updated with the real WooCommerce ID after the first push. Searchable Combobox for ingredient/sub-recipe selection with popover modal. Orphaned WooCommerce products shown in yellow. 23 allergen toggle buttons — stored as comma-separated `dietaryInfo` on `MenuItem`.

### EOD Reconciliation (`/api/admin/inventory/reconcile`)
Aggregates exploded ingredients from completed orders, tallies `requiredBaseQty` per inventory item. Returned as reconciliation report. Deferred inventory deduction (Phase 5).

### FOH Operations View (`/admin/orders` — FOH VIEW tab)
`GET /api/admin/orders/foh?date=` returns bookings for a date with table assignments (via CalendarEvent → FloorPlanSetup → SetupItem chain), line items with dietary info, and category totals. Admin UI has tabbed ORDERS / FOH VIEW with date picker, booking cards (party size, tables, line items, status), and right sidebar showing dish totals by inventory category.

### Kitchen Worker View (`/w/kitchen`)
`GET /api/worker/kitchen` (JWT via `jose`) returns today's order items grouped by table with dietary badges, unassigned items section, and prep totals grid. Auto-refreshes every 15s. Worker hamburger menu has KITCHEN tile. Admin nav has KITCHEN under Operations. Groundwork for future live service mode: `KitchenStatus` enum (PENDING/COOKING/READY/SERVED) on `WooOrderItem.kitchenStatus`.

## FUTURE INTEGRATION STUBS

| Stub | Location | Phase |
|---|---|---|
| SwiftPOS staff sync | `Staff.swiftPosId` field | 2 |
| Budget splitter | `lib/budget-math.ts`, `BudgetPeriod`/`BudgetCategory`/`BudgetDay`/`BudgetDayAllocation` models | 4 (built) |
| Training modules | `TrainingModule`, `TrainingStep` models | 3 |
| Push notifications | Not yet wired | 2 |
| S3 file uploads | `UPLOAD_PROVIDER=s3` env var stub | 2 |
| Inventory delete protection | API check against ElementInventoryItem + StocktakeLineItem | 2 |
| Inventory floor plan sync | Auto-create inventory items from element counts | 2 (built — replaced by TableProfile BOM system) |
| Chair snap-to-table edge | Auto-snap chairs to table edges on drag-end | 2 (built — `distributeChairsAlongPerimeter`) |
| Two-layer canvas | Fixtures bottom, furniture top | 2 (built — 3-layer PixiJS canvas: baseLayer + sectionBoundaryLayer + setupLayer) |
| MyHR onboarding export | Generate onboarding doc from training modules | 3 |
| Reordering / required-for-role gating | Drag-order modules, block shifts until mandatory training done | 3 |
| Loaded Reports integration | Export format compatible with Loaded accounting | 4 |
| Basic labour cost visibility | Estimated hours × rate per department per day | 4 |
| Microsoft Graph API | Read emails and calendar events (no LLM, read-only) | 5 |
| Microsoft Teams notifications | Send task overdue alerts to Teams channels | 5 |
| Outlook calendar sync | Overlay venue events on task schedule view | 5 |
| SwiftPOS deep sync | Roster data → automatic task assignment | 5 |
| Food H&S diary + ESP32 temp logging | Digital food-safety diary; ESP32 sensor ingest endpoint, fridge/delivery/cook-probe temps, threshold alerts (see ROADMAP) | 5 |
| Multi-tenant SaaS mode | White-label per business, isolated data per tenant | 6 |
| Role-based permission system | Granular permissions beyond ADMIN/MANAGER/STAFF | 6 |
| Public API | REST API for third-party integrations | 6 |
| Mobile app wrapper | Capacitor or React Native shell around worker view | 6 |
| Offline support | Service worker caching for unreliable wifi | 6 |

## TESTING

Every code change that touches component logic or hooks MUST include a Vitest
regression test. No test, no merge.

**Stack:** `vitest` + `@testing-library/react` + `jsdom`
**Config:** `apps/web/vitest.config.ts`, setup via `apps/web/vitest-setup.ts`
**Location:** test files live alongside components (e.g. `FloorPlanEditor.test.tsx`
next to `FloorPlanEditor.tsx`).

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
| `lib/calendar.ts` — `monthDays`, `isValidTime`, `dateKeysBetween` | ✅ |
| `lib/ical.ts` — `feedsForVenue`, `googleEmbedToIcal` | ✅ |
| `lib/scheduling.ts` — `isTaskDueOnDate`, `describeSchedule`, `formatDateKey` | ✅ |
| `lib/utils.ts` — all 8 exports | ✅ |
| `lib/training.ts` — `getStaffTraining`, `getStaffSops` | ✅ |
| `lib/retrain.ts` — `postRetrainNotice` | ✅ |
| `lib/demo-block.ts` — `shouldBlockDemoWrite` | ✅ (14 tests) |
| `lib/worker-session.ts` — `workerCookieSecure` | ✅ |
| `lib/followups.ts` — `checkUntrainedOnCompletion` | ✅ |
| `lib/external-sync.ts` — `syncVenueCalendar` | ✅ |
| `lib/floorplan-inventory.ts` — `calculateSetupInventory`, `computeSetupSectionTotals`, `pointInPolygon`, geometry fns | ✅ (49 tests) |
| `lib/floorplan-chairs.ts` — `adjustEdgeChairs`, `defaultEdgeChairs`, `maxChairsForEdge` | ✅ (11 tests) |
| `lib/auto-seat.ts` — `planAutoSeat` (bin-packing layout) | ✅ (7 tests) |
| `lib/inventory-engine.ts` — `explodeRecipe` (recursive BOM explosion) | ✅ (5 tests) |
| `lib/woo-push.ts` — `mapStatusToWoo`, payload builders, `isSelfEcho` echo guard | ✅ |
| `lib/woo-sync.ts` — `runProductPull`, `upsertProductFromWoo`, `fetchWooCategories` | ✅ |
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
| `CalendarClient.tsx` — 22 useState | ✅ |
| `WorkerTasksClient.tsx` — dual early-return paths | ✅ |
| `FloorplanInspector.tsx` — presets, sliders, booth capacity | ✅ |
| `FloorplanToolbar.tsx` — zoom, DIM toggle | ✅ |
| `Button` (ui) — variants, sizes, loading, disabled | ✅ |
| `Input` (ui) — label, error, onChange | ✅ |
| `Select` (ui) — options, placeholder, error, onChange | ✅ |
| `TableProfilesClient.tsx` — render, loading, fetch, headings, empty state, selection, form | ✅ (10 tests) |
| `SetupInventoryPanel.tsx` — button states, shortage list, idle, empty, disabled | ✅ (7 tests) |

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
   (e.g. `Admin → Operations → Bookings`, `Admin → Organisation → Inventory`).
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

4. **Update the docs** (CLAUDE.md, ROADMAP.md, ECOSYSTEM.md) to reflect any
   new models, API routes, design conventions, or feature phases.

5. **GitHub Actions CI** — remind the user of the workflow fixes if relevant
   (Prisma generate step, turbo test command). If the workflow file was changed
   in this session, flag it.

## WHAT NOT TO DO

- **NO hard deletes** — never call `prisma.model.delete()`. Always set `deletedAt`.
- **NO `any` types** — TypeScript strict mode. Use types from `packages/types`.
- **NO inline styles** — Tailwind utility classes only.
- **NO plain-text PINs** — always bcrypt hash before storing, never log.
- **NO direct DB access in client components** — Server Actions or API routes only.
- **NO manual schema changes** — change `schema.prisma`, never hand-edit the DB. (Deploy syncs it via `prisma db push`; see "Why db push" above.)
- **NO storing session tokens in `localStorage`** — HTTP-only cookies only.
- **NO module-level imports of `konva` or `react-konva`** — always use `import('react-konva')` inside `useEffect` to prevent SSR crashes. Never `import ... from 'react-konva'` at the top of a file.
