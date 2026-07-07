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

## PHASE 2 — INTELLIGENCE & ERP UPGRADE
✅ **ERP Upgrade** — Prisma 7 (PG adapter), Turborepo 2.10, ESLint 9 flat config, Vitest 3, Tailwind CSS 4, Node.js 22
✅ **Deep Inventory** — Supplier model, UnitOfMeasure with base unit conversion, InventoryItem deep fields (costPrice, yield%, expiryDate, allergyInfo), inventory tabs (FOOD/BEVERAGE/OTHER), supplier item codes
✅ **Recipe Engine** — Nested Recipe/RecipeLineItem with recursive BOM, explodeRecipe utility with cycle detection, searchable Combobox for ingredient selection
✅ **Menu Items** — Combined with Recipes page (LINK TO MENU toggle), WooCommerce product ID + category mapping
✅ **WooCommerce Integration** — Webhook handler (HMAC auth, order upsert, recipe explosion, auto-seating), product sync cron, expiry scan cron, EOD reconciliation
✅ **Settings** — WooCommerce section (store URL, consumer key/secret, webhook secret, active toggle with lastSync display)
✅ **Orders Dashboard** — Read-only table sorted by fulfillmentDate, expandable line items, auto-seating status indicator
☐ **Phase 5: Inventory Deduction** — Reverse UOM conversion from base units → item counts during EOD reconciliation
☐ **Phase 6: Time Clock & Payroll** — Geo-fenced time punches, shift auto-calculation, payroll export

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

## FLOOR PLANNER (BUILT 2026-06-22 — UNDER PIXIJS REWRITE 2026-06)

✅ **Phase 1 — Editor + basic views**
  ✅ Prisma models: `FloorPlan` + `FloorPlanElement` + enums (`ElementType` / `ElementShape`)
  ✅ Admin API: CRUD floor plans + bulk-save elements (`PUT /api/admin/floorplan/[id]/elements`)
  ✅ Admin page: `/admin/floorplan` — list plans, create, edit
  ✅ Visual editor: room outline drawn to scale (real cm), drag-from-palette, grid snapping, select→move→resize→rotate, colour/section-link/capacity properties, SAVE
  ✅ Worker API: `GET /api/worker/floorplan` (by JWT venue, returns default view)
  ✅ Worker read-only page: `/w/floorplan` with view switcher if venue has multiple plans (slug-based), section-colour-coded elements, tap for details
  ✅ Nav: admin sidebar under Organisation + burger menu FLOOR PLAN card + dashboard card
  ✅ Polygons: data model supports `shape: POLYGON` + `vertices Json?` from day one; drawing tool deferred

✅ **Phase 1.5 — Styled elements, walls as lines, sections & inventory prep**
  ✅ Per-type styled rendering (table with legs, chair bracket shape, booth bench with cushion inset, door with swing arc, window with dividers, sink with basin, stairs with stripes, storage grid, kitchen equip inset, plant as dashed planter, toilet oval, bar with highlight, counter with edge, etc.)
  ✅ Walls / Entry / Exit rendered as thick lines with centred toggleable label
  ✅ Arbitrary wall angles
  ✅ Delete/Backspace keyboard handler deletes selected element
  ✅ `BOOTH_BENCH` element type — long rect with cushion inset, capacity field tracks seats per segment
  ✅ Auto-label on drop — tables get T1/T2…, chairs C1/C2…, benches B1/B2…
  ✅ Label visible on all elements (centred text, monospace, auto-sized) for printable plans
  ✅ Section colour overlay toggle — semi-transparent section colour fill on elements
  ✅ Section summary panel — live count of tables/chairs/benches/etc. per section with total rows
  ✅ Shared element renderer (`components/admin/floorplan-elements.tsx`) — single source of truth for palette defaults + visual components
  ✅ `style Json?` field on FloorPlanElement for per-type config (wall type, table shape, chairStyle, etc.)
  ✅ `labelVisible Boolean` field toggles label display per element

✅ **Phase 2 — Inventory, zones, calendar linking, undo/redo, PDF, PixiJS rewrite**
  ✅ **Inventory system**
    ✅ `InventoryCategory` model: name, isBuiltIn (7 built-in + custom per venue)
    ✅ `InventoryItem` model: venueId, name, categoryId, unit, defaultParLevel; plus furniture fields (furnitureType, elementWidth, elementDepth, elementShape, defaultColour, defaultChairCount)
    ✅ `ElementInventoryItem` junction: links items → floor plan elements with quantity
    ✅ Admin CRUD: categories page, items page, element inventory panel in floor plan editor
    ✅ `StocktakeRecord` model: venueId, date, status (PENDING/IN_PROGRESS/COMPLETED), assignedRoleId, assignedStaffId, notes
    ✅ `StocktakeLineItem` model: recordId, itemId, countedQuantity, expectedQuantity, variance
    ✅ Admin stocktake page: create, assign to role/staff, review variance, sign-off
    ✅ Worker stocktake screen: dashboard card, scrollable count list, submit IN_PROGRESS or COMPLETED
    ✅ Par level alerts on dashboard: items below threshold flagged
    ✅ FURNITURE category added as built-in; furniture items created in inventory and placed via palette INVENTORY section
    ✅ Stock-aware tracking: `totalQty` field, `placedCount` from API, `availableQty` badges on palette items
    ✅ Drop gate: blocked when availableQty ≤ 0 with toast notification; live decrement on placement
    ✅ Stock hierarchy tree (`GET /api/admin/stock/hierarchy`) — Section → Table → Inventory Items
    ✅ Inventory admin UI: master-detail layout with vertical category nav, real AVAIL column, compact grid form
    ✅ PUT /api/admin/inventory/[id] route for editing items (totalQty, par, furniture fields)
    ✅ Structure API extended with `floorPlan { tables, chairs, equip }` per section
  ✅ **Per-corner rounding** — 4 corner radius inputs (TL/TR/BR/BL) on any RECTANGLE element, stored in `style.cornerRadius`
  ✅ **Drawable section zones** — drag-to-draw coloured zone rectangles on canvas; pick section from dropdown; zones saved as JSON on FloorPlan; zone fill 0.06 opacity, border 0.4/0.6; auto-rotated watermark; per-zone labelScale
  ✅ **Zone resize handles** — 8 white squares on selected zone (TL/TC/TR/ML/MR/BL/BC/BR), drag to resize snapped to grid
  ✅ **Element section grouping overlay** — coloured border + faint fill tint when element matches a zone's sectionId
  ✅ **Table↔bench linking** — assign BOOTH_BENCH to specific TABLE elements via checkboxes; dashed gold connector line; "B1 serves T1, T2" in summary
  ✅ **Calendar event floor plan linking** — `CalendarEvent.floorPlanSlug` + `floorPlanName` fields; admin event modal selector; worker auto-switches with banner
  ✅ **Undo/redo stack** — Ctrl+Z / Ctrl+Shift+Z; history pushed on add, delete, drag-end, transform-end
  ✅ **PDF export** — render canvas to PDF with date/venue header via jspdf
  ✅ **Switched from Konva to PixiJS v7** — Konva's draggable+React caused unresolvable bugs; now uses raw PIXI.Application with pointer-delta drag, room.scale transform, ResizeObserver full-screen
  ✅ **Zoom/pan** — mouse wheel zoom (0.2x–5x centered on cursor), middle-click pan, zoom indicator
  ✅ **Full-screen canvas** — ResizeObserver replaces hardcoded dimensions
  ✅ **Multi-select** — Shift/Ctrl+click + rubber-band selection rectangle
  ✅ **Edge-aware snapping** — snap to nearest grid line (left OR right edge) via `edgeSnap()`
  ✅ **GRID snap ON by default**
  ✅ **Rotation preset buttons** — 0°/45°/90°/135°/180°/270°
  ✅ **Bracket chairs** — bracket `[` shape with per-side checkboxes (T/B/L/R), 5cm gap from table edge; default style
  ✅ **Static right panel** — always-rendered w-56 panel with layer list when nothing selected; no canvas width jump
  ✅ **Right-click palette edit** — edit default W/D per palette item, persisted via PaletteDefault model
  ✅ **Global text scale slider** — 0.5x–3.0x, passed as textScale prop
  ✅ **Asymmetric element labels** — use longer dimension when aspect ratio > 2:1
  ✅ **Save API returns `_clientId` mapping** — client maps temp IDs to real DB IDs post-save
  ✅ **Save API accepts `inventoryLinks`** — atomic create of ElementInventoryItem rows
  ✅ **Save API stock validation** — blocks save if placed count exceeds totalQty per item
  ✅ **Save API table label uniqueness** — no duplicate TABLE labels within a plan
  ✅ **CAD-style inspector** — width/depth range sliders (20-500cm) + preset buttons; seat capacity + linked tables for polygon booths
  ✅ **Toolbar** — zoom slider (0.2x-5x), dimension overlay toggle, DRAW BOOTH paint mode
  ✅ **Custom painted booths** — paint 50x50cm grid squares to create snaking banquettes; polygon-clipping union + polygon-offset cushion; saved as POLYGON shape with outer + cushion vertices
   ✅ **Toast notifications** — reusable `components/ui/Toast.tsx` (error/success/info, DOS-Modern, auto-dismiss)

## PHASE 2.5 — INVENTORY-AWARE SPATIAL PLANNING ENGINE (BUILT 2026-07)

✅ **Layered floor plans** — `FloorPlanSetup` + `SetupItem` models: a base plan (walls/fixtures) can have many named furniture setups. Admin setup toolbar with switcher, create, delete.
✅ **Table Profiles (BOM)** — `TableProfile` + `TableProfileItem` models: each profile defines a table type with capacity, dimensions, colour, `chairCount`, `seatingDensity`, `maxHeadChairs`, and `tableNumbers`. BOM items link to inventory items with `perChair` toggle.
✅ **TableProfile management UI** — `/admin/table-profiles` page: left panel list, right panel form with tag input for `tableNumbers`, inline BOM add/remove.
✅ **Table auto-assignment** — when a profile is dragged onto the canvas, the lowest available `tableNumber` from the pool is auto-assigned. Used numbers display as labels. Pool exhaustion shows error toast.
✅ **Magnetic edge snapping** — same-profile tables snap flush together on drag end (parallel edge detection, overlap, facing, rotation alignment).
✅ **Section boundary detection** — `pointInPolygon` on drop to auto-assign `sectionId`. `SectionBoundary` model with RECTANGLE/POLYGON support.
✅ **Inventory calculation engine** — `calculateSetupInventory()` pure function: tallies BOM items, compares against venue inventory, returns sorted shortages. Panel D shows real-time shortages on CHECK button click.
✅ **Banquet joinery** — `TableGroup` model: same-profile tables can be grouped. `computeGroupChairs` unions polygons via `polygon-clipping`, computes exposed perimeter, distributes chairs via `distributeChairsAlongPerimeter`.
✅ **Head-of-table constraint** — on rectangular tables, short edges ("head") are capped at `maxHeadChairs × headMultiplier` chairs, preventing chair crowding.
✅ **PixiJS 3-layer canvas** — `baseLayer` (walls/fixtures), `sectionBoundaryLayer` (translucent polygons), `setupLayer` (interactive tables with drag/snap/select).
✅ **Worker setup view** — `/w/floorplan` with setup switcher dropdown, setup banner, read-only canvas with setup items.
✅ **Grouping UI** — GROUP/UNGROUP buttons in setup toolbar, same-profile validation, optimistic state updates.
✅ **11 new API routes** — CRUD for `TableProfile`, `FloorPlanSetup`, `SetupItem`, `TableGroup`, `SectionBoundary`.
✅ **Vitest** — 206 tests across 28 files. `floorplan-inventory.test.ts`: 46 tests including BOM integration, head constraint, section detection.
✅ **CI** — All commits pass Docker build + push.

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

## PHASE 4 — FINANCE (BUILT 2026-06-24)

✅ **Budget splitter — weighted multi-category model**
  ✅ `BudgetPeriod` + `BudgetCategory` + `BudgetDay` + `BudgetDayAllocation` — 4-model relational schema
  ✅ Categories link to departments (`BudgetCategory.departmentId → Department`) or are venue-wide (`__venue__`)
  ✅ Per-venue, per-month budget periods with `@@unique([venueId, year, month])`
  ✅ Soft-delete on all budget models, never hard delete
  ✅ Auto-copy breakdowns forward — GET API returns most recent period's categories as defaults for empty months
  ✅ `lib/budget-math.ts` — `generateDailyBudgetsNormalized()` with ISO weekday weighting, $500 rounding, and post-rounding correction (never under budget)
  ✅ `lib/budget-math.ts` — `computeBreakdowns()` for department-level sub-splits of daily revenue
  ✅ Two-tier REVENUE + BREAKDOWN structure: REVENUE always 100% of the month total; optional department-linked sub-percentages (e.g. BEVERAGE 21%, FOOD 30%) with auto-REMAINDER
  ✅ APIRoutes: `GET /api/admin/budget` (fetch + defaults), `POST` (create period + day rows), `PUT /api/admin/budget/[id]` (upsert categories/days/allocations in `$transaction`), `DELETE` (soft-delete)
  ✅ `POST /api/admin/budget/sync-breakdowns` — copies current breakdowns to ALL months in a venue by name matching
  ✅ Smart auto-copy: GET skips empty periods via `categories.some` filter, finds last period with actual breakdowns

✅ **Budget UI — dual-mode month selector + 2-column dashboard**
  ✅ `BudgetMonthSelector` — dual variant: `grid` (12-month 3×4 grid + year toggle for landing page) and `compact` (slim `[←] MON YEAR [→]` + `VIEW ALL MONTHS` for monthly page)
  ✅ Landing page at `/admin/budget` — grid variant, auto-selects first venue
  ✅ Monthly page at `/admin/budget/[year]/[month]` — compact variant, full budget editor
  ✅ `BudgetSetupPanel` — 2-column dashboard layout: left = ALLOCATION (total budget + REVENUE + indented breakdowns with department picker + auto-REMAINDER + progress bar), right = DAILY WEIGHTING (MON-SUN inputs with 100% validation) + SUMMARY (TARGET / ALLOCATED / VARIANCE stats + action buttons)
  ✅ SUMMARу stats update in real-time when editing days in the grid
  ✅ Venue selector at top of BudgetMonthSelector, auto-defaults to first venue for admins
  ✅ Default REVENUE category pre-filled at 100% — no manual setup needed for basic use
  ✅ Department dropdown includes `VENUE` option for venue-wide expenses (admin, sundry, rent)
  ✅ `↻ SYNC BREAKDOWNS` button — pushes current categories + percentages to all venue months

✅ **BudgetDailyGrid — week cards + inline breakdowns**
  ✅ ISO week grouping with `WEEK N — MON D MMM TO SUN D MMM` headers
  ✅ CSS Grid `lg:grid-cols-2` of week cards on desktop, stacked on mobile
  ✅ Week header shows summed total for that week
  ✅ Single editable REVENUE input per day (no NOTE field)
  ✅ Inline read-only breakdown text: `BEV: $945 | FOOD: $1,350 | REMAINDER: $2,205` computed from REVENUE × category%
  ✅ Weekend rows dimmed, non-working days 40% opacity
  ✅ State lifted to parent: grid edits update `allocations` → stats recompute → SUMMARY panel updates in real-time

~~Labour cost visibility~~ — DROPPED. Loaded already does this well; HOSPO OPS is an operational "what's on" board, not a finance/analytics tool.
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
- No cron engine — task scheduling is filtered on read, not generated in advance
- File uploads are local disk only — not suitable for multi-server deployments
- No rate limiting on PIN login endpoint — to be added before public exposure
- Konva + react-konva removed from dependencies
- ESLint moved to flat config with eslint-config-next 15
- Prisma 7 PG adapter: `prisma.config.ts` replaces `package.json#prisma`; schema `datasource.url` removed in favour of config file + PG pool
- `ts-node` replaced with `tsx` for seed scripts
- Tailwind CSS 4: config migrated to CSS `@theme` directives; `tailwind.config.ts` deleted
