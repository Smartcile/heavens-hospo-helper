# HOSPO OPS — AI CODING CONTEXT

HOSPO OPS is a self-hosted, web-based hospitality operations platform. It gives venue managers a dashboard to create and assign recurring tasks, and gives floor staff a fast mobile interface (accessed via printed QR code + PIN) to complete those tasks.

> Behavioural working rules live in the global `~/.claude/CLAUDE.md` (apply to all projects).

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
| Canvas / Floor Plans | `pixi.js` v7.3.3 (`konva` + `react-konva` still present but unused) |

## MONOREPO STRUCTURE

```
hospo-ops/
├── apps/
│   └── web/                        # Next.js app (admin + worker UI)
│       ├── app/
│       │   ├── admin/
│       │   │   ├── (protected)/    # Auth-gated admin routes (/admin/*)
│       │   │   │   └── floorplan/  # Floor plan editor (/admin/floorplan)
│       │   │   └── login/          # /admin/login — public
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

### Training (Phase 3)
`TrainingModule` + `TrainingStep` hold guides (steps: text + `imageUrl` upload +
`videoUrl` link). A module applies to a person when it is onboarding
(`isOnboarding`, all staff), department-scoped (`departmentId` == staff's dept),
or individually assigned (`TrainingAssignment`, with a `reason` for upskill/areas
to work on). `requiresSignOff` toggles staff-self-complete vs manager sign-off.
`linkedTaskId` ties a guide to a task so it surfaces in the worker task view.
`TrainingCompletion` records who completed what (`selfCompleted` vs
`signedOffById`). `lib/training.ts:getStaffTraining()` is the shared resolver
used by the admin per-staff panel (`/api/admin/staff/[id]/training`) and the
worker view (`/api/worker/training`). Admin authoring at `/admin/training`;
sign-off/assign from the Staff page; worker view at `/w/training`. Step photos
upload via `/api/admin/upload`.

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

### Floor planner (Phase 1 + 2, built)
To-scale venue layout editor using **PixiJS v7** canvas (migrated from Konva 2026-06 — Konva's
draggable+React caused unresolvable event target and race condition bugs). Admin creates floor
plans with room dimensions (real cm), then drags elements from a palette onto a grid-snapped
canvas. Elements are drawn in real cm; room.scale transform handles zoom/pan (no per-element
scaling). Canvas fills available space via ResizeObserver.

**Palette:** WALL, DOOR, WINDOW, TABLE, CHAIR, COUNTER, BAR, SINK, KITCHEN_EQUIP, STORAGE,
ENTRY, EXIT, STAIRS, TOILET, PLANT, OTHER (static palette items), plus dynamic **INVENTORY**
section listing furniture inventory items. Furniture items (tables/chairs) are pre-created in
the inventory module as FURNITURE-category templates; once placed and saved, they're removed
from the palette (used-once tracking via `ElementInventoryItem`).

**Canvas features:** middle-click pan, mouse-wheel zoom (0.2x–5x centered on cursor), zoom
indicator in toolbar. Element drag uses pointer-delta (captured start position + delta) — tracks
cursor reliably at any speed. Multi-select via Shift/Ctrl+click + rubber-band rectangle. Edge-aware
grid snapping (snaps to nearest grid line — left OR right edge). GRID snap ON by default.
Rotation via preset buttons (0°/45°/90°/135°/180°/270°). Global text scale slider (0.5x–3.0x).
Zone resize handles (8 white squares on selected zone — TL/TC/TR/ML/MR/BL/BC/BR — drag to resize,
grid-snapped). Per-type styled rendering (table with legs, chair as bracket `[` shape, door with
swing arc, booth bench with cushion inset, etc.). Bracket `[` is the default chair style with
per-side checkboxes (T/B/L/R) and 5cm gap from table edge. Zones with auto-rotated watermark
for portrait orientations. Per-element/zone labelScale input.

**Section zones:** coloured rectangles drawn on canvas with 0.06 fill / 0.4-0.6 border opacity,
section name watermark, saved as JSON on FloorPlan. Element section grouping overlay (coloured
border + faint fill when element matches a zone's sectionId). SECTIONS mode button gates zone
drawing/drag — zones non-interactive otherwise.

**Data flow:** Bulk SAVE sends all elements as one PUT to `/api/admin/floorplan/[id]/elements`,
which diffs incoming IDs vs existing DB IDs — soft-deletes removed elements, updates existing,
creates new ones. The save API also accepts `inventoryLinks` to create/remove
`ElementInventoryItem` rows atomically. Response includes `_clientId`→real-ID mapping so local
state updates consistently.

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

### Inventory + stocktake (Phase 2, built)
Full inventory management system: `InventoryCategory` (7 built-in + per-venue custom) and
`InventoryItem` (venue-id-scoped, links to category, tracks unit and default par level).
`ElementInventoryItem` junction links items to floor plan elements with quantity.
`StocktakeRecord` + `StocktakeLineItem` for periodic stock counts: records have status
(PENDING/IN_PROGRESS/COMPLETED), assigned to role or staff. Stocktake supports variance
tracking and manager sign-off.

**Admin pages:** `/admin/inventory` (categories + items CRUD, plus STOCK tab showing hierarchy
tree — Section → Table → Inventory Items, fetched from `/api/admin/stock/hierarchy`). `/admin/stocktake`
(create/assign/review/sign-off). Dashboard par level alerts.

**Worker page:** `/w/stocktake` — scrollable count list, submit IN_PROGRESS or COMPLETED.
Dashboard stocktake card with pending count. Hamburger menu entry.

**AdminNav:** Inventory under Organisation, Stocktake under Operations.

### Stock hierarchy (Phase 2, built)
`GET /api/admin/stock/hierarchy` returns a Section → Table → Inventory Items tree in one query.
The Structure API (`GET /api/admin/structure`) extends with `floorPlan { tables, chairs, equip }`
per section.

### Unified staff identity
A single `Staff` profile carries external-system link IDs — `swiftPosId`,
`myHrId`, `loadedReportsId` — so one person maps across SwiftPOS, MyHR, and
LoadedReports. These are editable in the Staff form now; automated sync is a
future item (see ROADMAP). `email` doubles as a natural cross-system match key.

### Live structure map
`/admin/structure` (`StructureClient` + `GET /api/admin/structure`) renders the
live entity tree — venue → department → section → staff / tasks / training, plus a
venue-wide bucket — as collapsible nodes with counts. Manager sees own venue,
admin sees all. The API also extends with `floorPlan { tables, chairs, equip }`
per section. It's a read-only visual review.

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
- Login pages (`/admin/login`, `/w/login`) are outside the protected groups so they don't inherit the auth check.

### Soft deletes everywhere
Every model has `deletedAt DateTime?`. Set `deletedAt: new Date()` to delete. Never use Prisma `delete()`. Always add `where: { deletedAt: null }` to all queries.

### ALL CAPS convention
Task titles, venue names, department names, and staff names are stored in UPPERCASE. Apply `.toUpperCase().trim()` before every insert/update.

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
- `konva` + `react-konva` are unused but remain in package.json for now.

### PixiJS canvas rendering
The floor plan canvas uses `pixi.js` v7.3.3 via a custom `FloorPlanPixiCanvas` component
(no React-Pixi wrapper — raw PIXI.Application managed in a ref). SSR is avoided by using
`next/dynamic` with `ssr: false` for both admin editor and worker view (no special SSR
handling needed — PixiJS doesn't crash on SSR, but it has no DOM node until mounted).
The `konva` and `react-konva` packages remain in `package.json` but are unused; they can
be removed when convenient. The `npm overrides` for React 18 in root `package.json` can be
removed when `react-konva` is removed (they exist because `react-konva@18` requires React 18
while `next-auth` peer-deps allow React 19).

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

## FUTURE INTEGRATION STUBS

| Stub | Location | Phase |
|---|---|---|
| SwiftPOS staff sync | `Staff.swiftPosId` field | 2 |
| Budget splitter | `lib/budget-math.ts`, `BudgetPeriod`/`BudgetCategory`/`BudgetDay`/`BudgetDayAllocation` models | 4 (built) |
| Training modules | `TrainingModule`, `TrainingStep` models | 3 |
| Push notifications | Not yet wired | 2 |
| S3 file uploads | `UPLOAD_PROVIDER=s3` env var stub | 2 |
| Inventory delete protection | API check against ElementInventoryItem + StocktakeLineItem | 2 |
| Inventory floor plan sync | Auto-create inventory items from element counts | 2 |
| Chair snap-to-table edge | Auto-snap chairs to table edges on drag-end | 2 |
| Two-layer canvas | Fixtures bottom, furniture top | 2 |
| MyHR onboarding export | Generate onboarding doc from training modules | 3 |
| Reordering / required-for-role gating | Drag-order modules, block shifts until mandatory training done | 3 |
| Loaded Reports integration | Export format compatible with Loaded accounting | 4 |
| Basic labour cost visibility | Estimated hours × rate per department per day | 4 |
| Microsoft Graph API | Read emails and calendar events (no LLM, read-only) | 5 |
| Microsoft Teams notifications | Send task overdue alerts to Teams channels | 5 |
| Outlook calendar sync | Overlay venue events on task schedule view | 5 |
| SwiftPOS deep sync | Roster data → automatic task assignment | 5 |
| Multi-tenant SaaS mode | White-label per business, isolated data per tenant | 6 |
| Role-based permission system | Granular permissions beyond ADMIN/MANAGER/STAFF | 6 |
| Public API | REST API for third-party integrations | 6 |
| Mobile app wrapper | Capacitor or React Native shell around worker view | 6 |
| Offline support | Service worker caching for unreliable wifi | 6 |

## WHAT NOT TO DO

- **NO hard deletes** — never call `prisma.model.delete()`. Always set `deletedAt`.
- **NO `any` types** — TypeScript strict mode. Use types from `packages/types`.
- **NO inline styles** — Tailwind utility classes only.
- **NO plain-text PINs** — always bcrypt hash before storing, never log.
- **NO direct DB access in client components** — Server Actions or API routes only.
- **NO manual schema changes** — change `schema.prisma`, never hand-edit the DB. (Deploy syncs it via `prisma db push`; see "Why db push" above.)
- **NO storing session tokens in `localStorage`** — HTTP-only cookies only.
- **NO module-level imports of `konva` or `react-konva`** — always use `import('react-konva')` inside `useEffect` to prevent SSR crashes. Never `import ... from 'react-konva'` at the top of a file.
