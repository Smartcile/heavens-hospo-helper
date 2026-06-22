# HOSPO OPS — ROADMAP

---

## PHASE 1 — CORE (CURRENT)
✅ Multi-venue + multi-department support
✅ Staff profiles with PIN auth (bcrypt-hashed, 2–4 digits)
✅ Task creation with scheduling (DAILY / WEEKLY / CUSTOM cron)
✅ QR code generation and worker login flow
✅ Worker mobile task view with completion types (TICK / TICK+NOTE / TICK+PHOTO)
✅ Admin dashboard with today's completion stats
✅ Admin reporting with audit log and CSV export
✅ Docker Compose deployment with Nginx reverse proxy
✅ Soft deletes everywhere — no data is ever destroyed
✅ DOS-MODERN design system — monochrome, sharp corners, monospace typography

---

## PHASE 2 — INTELLIGENCE
✅ **Per-venue timezone** — daily reset, worker view, dashboard, and overdue all use each venue's local day
✅ **Proper admin email auth** — real email + password login for ADMIN/MANAGER (bcrypt); floor staff keep QR + PIN; legacy `swiftPosId`-as-login backfilled automatically
☐ **Unified staff sync (COMING SOON)** — one profile linked across SwiftPOS / MyHR / LoadedReports via per-system ID fields (editable now); planned: CSV import then API sync, matching on email + system IDs
✅ **Calendar — roster + time off (v1)** — month overview with shift roster (times), time-off request→approve workflow, and a duty-days overlay (from task schedules); managers manage it in admin, staff see their own shifts + request time off on their phone
☐ **Calendar — events + guest numbers** — manual venue events + expected covers per day on the same calendar (next round)
☐ **Calendar sync (external)** — pull venue events/bookings from Microsoft Graph / Outlook alongside the native calendar
✅ **Recurring + overdue engine** — cron-aware scheduling (CUSTOM cron now actually evaluated, fixing daily/weekly/cron due-dates) plus missed-task tracking surfaced on the dashboard ("MISSED — LAST 7 DAYS") via `/api/admin/overdue`
☐ **Push notifications** — web push or email alerts for overdue/incomplete tasks at end of shift
✅ **Task templates library** — pre-built hospo SOP task sets (bar open, kitchen close, etc.) + custom templates, one-click apply to a department, and "save department as template" snapshot
☐ **S3 file uploads** — replace local disk uploads with S3-compatible object storage

---

## OPERATIONAL BOARD (display-first features)
✅ **Staff notice board** — managers post notices (priority, pin, whole-venue or department-targeted, optional "must acknowledge" with read tracking); staff see them on their phone and tap to acknowledge
✅ **External embeds** — paste a Loaded public-roster link and/or a Google Calendar embed link in Settings → Integrations, pick an auto-refresh interval; shown live as panels on the Calendar page (PLANNER / LOADED ROSTER / EVENTS tabs).
✅ **External calendar IMPORT** — Google Calendar + any `.ics`/webcal feed are parsed server-side and shown as events directly on the PLANNER month grid (and day modal). Re-synced on the chosen interval (or SYNC NOW) and reconciled by event UID: changed events update in place, removed events drop off — no double-ups (`CalendarEvent` model, `lib/ical.ts` parser with RRULE expansion, `lib/external-sync.ts`, `POST /api/admin/calendar/sync`). Loaded's public-roster SPA has no anonymous feed, so it stays embed-only unless an `.ics` subscribe link is available.
✅ **NZ break entitlements** — 10-min rest / 30-min meal breaks auto-calculated per shift length and shown on each roster shift (admin + worker), with a reference table in Settings
✅ **Live structure map** — `/admin/structure` renders the real venue → department → staff / tasks / training tree (collapsible, with counts); the planned Section layer shows as a placeholder. Read-only visual review.
✅ **Mobile-friendly admin nav** — burger menu + off-canvas drawer on phones, static sidebar on desktop.

## SECTION ECOSYSTEM (BUILT 2026-06-16) — see ECOSYSTEM.md
The model that links sections, tasks and knowledge into one followed-up loop.
✅ **A · Section layer** — `Section` model under `Department` (Venue → Dept → Section); `Task.sectionId`; `Staff ⇄ Section` many-to-many; `/admin/sections` CRUD; section pickers on the Task and Staff forms; sections rendered live on the Structure map.
✅ **B · Unify knowledge as resources** — `TrainingModule.kind` (TRAINING / SOP / FAQ / HOWTO); resources attach to sections (`ResourceSection`) and cross-link (`ResourceLink`); the Training page authors any kind; non-TRAINING kinds are reference-only (excluded from "my training").
✅ **C · Competency link** — `Task ⇄ Training` "requires" relation (`TaskRequiredTraining`), set per task; competency = existing `TrainingCompletion`.
✅ **D · Trigger engine + notifications** — `FollowUp` model + `lib/followups.ts`: done-but-untrained raises a follow-up at completion time; missed assigned tasks raise one and auto-assign the training. Surfaced at `/admin/followups` (resolve / one-click sign-off). In-app for now; push / WhatsApp later.

## CHECKLISTS + RE-TRAIN (BUILT 2026-06-16)
✅ **Tasks + Checklists merged** — Templates retired; a `Checklist` is now an ordered set of references to **live tasks** (`ChecklistTask`), not copies. Editing a task updates every checklist automatically. Managed via a CHECKLISTS tab on the Tasks page (`/admin/templates` redirects to `/admin/tasks`).
✅ **Change → re-train** — editing a task or SOP with "Require re-training" ticked bumps its `version` and auto-posts a must-acknowledge `RE-TRAIN` notice to the relevant group; staff confirm with GOT IT on `/w/notices`, managers see who's across it on `/admin/notices`. (`lib/retrain.ts`.)
✅ **Grouped side nav** — the admin sidebar is now collapsible groups (Overview / Organisation / Work / Daily ops / Finance + Settings); the active group auto-opens. Mobile burger drawer uses the same groups.
✅ **Tasks + Checklists side by side** — the Tasks page is a 50/50 two-column layout (Tasks left, Checklists right) on desktop, stacked on mobile. Editing a checklist opens an **inline editor in the right panel** (not a popup); **drag tasks from the left into it** (drop zone) plus up/down reorder. Tasks carry usage **labels** (LIST ×N / TRAINING / SOP / GUIDE), and task rows clip long text so the right-hand tags stay put. (TasksClient owns the shared data + single reload, so newly-added tasks appear in the checklist picker immediately.)
✅ **Tasks grouped by Department → Section** — the task list nests sections under each department, with a "general (no section)" bucket.
✅ **Embed a checklist in a training step** — a training/SOP step can link a checklist (filtered to the module's department); its tasks render as a tick-off list inside the module on the worker's phone (in-session walkthrough). `TrainingStep.linkedChecklistId`.
✅ **Shared floor task list** — the worker task view is grouped by Department → Section (the day's lists), shows the *whole* department's lists (not just personally-assigned), and completion is **global per task+date**: once anyone ticks a job it's done for the floor (shows "BY name"), so no double-ups.
✅ **Monthly scheduling** — tasks can be `MONTHLY` with a "when" option (start of month, end of month, mid-month, first/last weekday, first Monday, last Friday, or a specific day) and an **every-N-months** interval. Each task shows a schedule **label** (weekly → the days; monthly → the option, e.g. "EVERY 3 MONTHS · END OF MONTH"). `lib/scheduling.ts` `describeSchedule()`.
✅ **Timed lists** — a checklist can have an **"appears from" time** (`Checklist.appearFromTime`); on the floor it surfaces from that time and stays until every task in it is done for the day. The worker view groups by list (time-gated) first, then any other tasks by dept → section, with an "opens later" note for upcoming lists.
✅ **Tasks page editor polish** — the checklist editor is sticky (follows long task lists), the "add a task" dropdown is scoped to the checklist's department/section (drag in anything else), and the task list gained search + section + usage filters.

## FLOOR PLANNER (BUILT 2026-06-22)
✅ **Phase 1 — Editor + basic views**
  ✅ Prisma models: `FloorPlan` + `FloorPlanElement` + enums (`ElementType` / `ElementShape`)
  ✅ Admin API: CRUD floor plans + bulk-save elements (`PUT /api/admin/floorplan/[id]/elements`)
  ✅ Admin page: `/admin/floorplan` — list plans, create, edit
  ✅ Visual editor (`FloorPlanEditor.tsx`, react-konva): room outline drawn to scale (real cm), drag-from-palette to place walls/tables/chairs/counters/bars/doors/windows/sinks/stairs/toilets, grid snapping, select→move→resize→rotate, colour/section-link/capacity properties, SAVE, EXPORT PNG
  ✅ Worker API: `GET /api/worker/floorplan` (by JWT venue, returns default view)
  ✅ Worker read-only page: `/w/floorplan` with view switcher if venue has multiple plans (slug-based), section-colour-coded elements, tap for details
  ✅ Nav: admin sidebar under Organisation + burger menu FLOOR PLAN card + dashboard card
  ✅ Polygons: data model supports `shape: POLYGON` + `vertices Json?` from day one; drawing tool comes later
✅ **Phase 1.5 — Styled elements, walls as lines, sections & inventory prep**
  ✅ Per-type styled rendering (table with legs, chair as circle with backrest, booth bench with cushion inset, door with swing arc, window with dividers, sink with basin, stairs with stripes, storage grid, kitchen equip inset, plant as dashed planter, toilet oval, bar with highlight, counter with edge, etc.)
  ✅ Walls / Entry / Exit rendered as thick lines with centred toggleable label (`-- WALL --`, `==== EXIT ====`)
  ✅ Arbitrary wall angles — wall placed as horizontal line from palette, rotated via Transformer to any angle
  ✅ Delete/Backspace keyboard handler deletes selected element
  ✅ Furniture elements (TABLE, CHAIR, TOILET, PLANT, OTHER) are fixed-size — Transformer shows no resize anchors
  ✅ Fixture elements (WALL, DOOR, WINDOW, COUNTER, BAR, BOOTH_BENCH, SINK, KITCHEN_EQUIP, STORAGE, ENTRY, EXIT, STAIRS) remain resizable
  ✅ 45° rotation snap toggle — snaps to 0/45/90/135/180/225/270/315°
  ✅ `BOOTH_BENCH` element type — long rect with cushion inset, capacity field tracks seats per segment
  ✅ Auto-label on drop — tables get T1/T2…, chairs C1/C2…, benches B1/B2…
  ✅ Label visible on all elements (centred text, monospace, auto-sized) for printable plans
  ✅ Section colour overlay toggle — semi-transparent section colour fill on elements
  ✅ Section summary panel — live count of tables/chairs/benches/etc. per section with total rows
  ✅ Shared element renderer (`components/admin/floorplan-elements.tsx`) — single source of truth for palette defaults + visual components, eliminates colour duplication between editor and worker
  ✅ `style Json?` field on FloorPlanElement for per-type config (wall type, table shape, etc.)
  ✅ `labelVisible Boolean` field toggles label display per element
☑ **Phase 2 — Inventory, pen tool, section zones, calendar linking, undo/redo, PDF**
  ☑ **Inventory system**
    ☑ `InventoryCategory` model: name, isBuiltIn (7 built-in + custom per venue)
    ☑ `InventoryItem` model: venueId, name, categoryId, unit, defaultParLevel
    ☑ `ElementInventoryItem` junction: links items → floor plan elements with quantity
    ☑ Admin CRUD: categories page, items page, element inventory panel in floor plan editor
    ☑ `StocktakeRecord` model: venueId, date, status (PENDING/IN_PROGRESS/COMPLETED), assignedRoleId, assignedStaffId, notes
    ☑ `StocktakeLineItem` model: recordId, itemId, countedQuantity, expectedQuantity, variance
    ☑ Admin stocktake page: create, assign to role/staff, review variance, sign-off
    ☑ Worker stocktake screen: dashboard card, scrollable count list, submit IN_PROGRESS or COMPLETED
    ☑ Par level alerts on dashboard: items below threshold flagged
  ☑ **Bezier pen tool** — click = straight vertex, click-drag = bezier with control handles; double-click to close; tool button next to palette; pen preview rendering on canvas
  ☑ **Drawable section zones** — drag-to-draw coloured zone rectangles on canvas; pick section from dropdown; zones render behind elements at 0.1 opacity; saved as JSON on FloorPlan
  ☑ **Table↔bench linking** — assign BOOTH_BENCH to specific TABLE elements via checkboxes in properties panel; dashed gold connector line on canvas; "B1 serves T1, T2" in summary
  ☑ **Calendar event floor plan linking** — `CalendarEvent.floorPlanSlug` + `floorPlanName` fields; admin event modal has floor plan selector; worker auto-switches to event layout; banner: "EVENT MODE — [Name] LAYOUT ACTIVE"
  ☑ **Undo/redo stack** — Ctrl+Z / Ctrl+Shift+Z; history pushed on add, delete, drag-end, transform-end; buttons in toolbar
  ☑ **PDF export** — render canvas to PDF with date/venue header via jspdf

## PHASE 3 — TRAINING (prev. Phase 3, unchanged)
✅ **Training modules / guides** — authored in admin, with step-by-step content, **photos** (upload) and **video links**
✅ **Assignment** — onboarding (all staff), by department (auto), individually assigned (upskill / area to work on), and **task-linked** guides
✅ **Per-module sign-off model** — each module is either staff-self-complete or requires a manager sign-off
✅ **Worker access** — staff see "MY TRAINING" on their phone, work through guides, self-complete where allowed; linked guides surface on the task itself
✅ **Completion tracking** — who completed what, self vs signed-off (and by whom), shown per person on the Staff page
✅ **Manager end-of-day review** — per-shift view of each person's completed work + manager notes (area to work on / praise / incident); an "area to work on" can assign a follow-up training module in one click
☐ **MyHR onboarding export** — generate onboarding document from training modules
☐ **Reordering / required-for-role gating** — drag-order modules, block shifts until mandatory training done

---

## PHASE 4 — FINANCE
✅ **Monthly budget splitter** — set a month total, EVEN SPLIT across working days, mark days closed, with a live allocated-vs-budget balance check (`/admin/budget`)
✅ **Daily budget allocations** — editable per-day amounts + notes + working-day toggle
~~Labour cost visibility~~ — DROPPED. Loaded already does this well; HOSPO OPS is an operational "what's on" board, not a finance/analytics tool, so it deliberately stays out of cross-resource cost reporting.
☐ **Loaded Reports integration** — export format compatible with Loaded accounting software
☐ **Basic labour cost visibility** — estimated hours × rate per department per day

---

## PHASE 5 — INTEGRATIONS
☐ **Microsoft Graph API** — read emails and calendar events (no LLM, read-only)
☐ **Microsoft Teams notifications** — send task overdue alerts to Teams channels
☐ **Outlook calendar sync** — overlay venue events on task schedule view
☐ **SwiftPOS deep sync** — roster data → automatic task assignment by shift and staff member

---

## PHASE 6 — SCALE
☐ **Multi-tenant SaaS mode** — white-label per business, isolated data per tenant
☐ **Role-based permission system** — granular permissions beyond ADMIN/MANAGER/STAFF
☐ **Public API** — REST API for third-party integrations
☐ **Mobile app wrapper** — Capacitor or React Native shell around the worker view
☐ **Offline support** — service worker caching for unreliable wifi environments

---

## TECHNICAL DEBT / KNOWN ISSUES
- Admin login uses `swiftPosId` field as login email identifier — to be replaced in Phase 2
- No cron engine in Phase 1 — task scheduling is filtered on read, not generated in advance
- File uploads are local disk only — not suitable for multi-server deployments
- No rate limiting on PIN login endpoint — to be added before public exposure
- `react-konva` pinned to `18.2.16` (latest supporting React 18) — upgrade when Next.js supports React 19
- React 18/19 conflict resolved via npm `overrides` in root `package.json` — remove overrides when Next.js supports React 19
