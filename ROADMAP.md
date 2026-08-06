# HOSPO OPS — Roadmap

## What This Is

HOSPO OPS is a self-hosted operations platform for hospitality venues — restaurants,
bars, cafés, event centres, and hotels. It replaces the scattered mix of paper
checklists, WhatsApp groups, whiteboard rosters, shared Google Docs, and Excel
inventory sheets with a single system that everyone from the owner to the kitchen
hand can use.

### Who It's For

| Role | What they do with it |
|---|---|
| **Owner / GM** | Budget, see what's happening across venues, review completeness |
| **Venue manager** | Tasks, checklists, rosters, training, bookings, stock levels |
| **Head chef** | Recipes, menu costing, inventory, food safety diary, kitchen orders |
| **FOH manager** | Floor plans, table bookings, section zones, SOPs |
| **Floor staff** | Tick off today's tasks on their phone, view training guides, find equipment |
| **Bar staff** | Opening/closing checklists, recipe specs, stocktake counts |

### How It Works

```
OWNER sets budget & targets
  └─ MANAGER maps the venue: departments → sections → tasks → SOPs
       ├─ KITCHEN: recipes explode into inventory, orders auto-seat tables
       ├─ FLOOR: bookings occupy tables on the plan, checklists run the shift
       ├─ BAR: opening/closing lists, stocktakes, training guides
       └─ MAINTENANCE: equipment tracked by section, service schedule on calendar

WORKER opens their phone → ticks today's checklist → done for the floor
  └─ Missed tasks → follow-ups → training assigned automatically
       └─ Manager reviews who's trained on what, where gaps are
```

### The Core Ideas

**One source of truth.** A task exists once. Edit it, and every checklist that
references it updates. A recipe exists once — change the hollandaise and every
menu item that uses it recalculates cost and allergens. A table profile exists
once — place it on any floor plan, any event, and the BOM tallies automatically.

**The section is the spine.** A section (Coffee, Pass, Floor, Bar 1) bundles the
work that needs doing with the knowledge of how to do it. Tasks, SOPs, training
guides, tools, and equipment all hang off the same section — so when a new hire
starts on Coffee, they see their training, their opening checklist, and the tools
they need, in one place.

**Training drives safety and quality.** A task can declare the training required
before someone does it. The system flags untrained completions automatically —
not as a punishment, but as a prompt to assign the relevant guide. Over time this
builds a competency record for every staff member.

**The floor plan is not a picture — it's a database.** Tables placed on a canvas
are inventory items with BOMs. Bookings reserve those tables and deduct from
availability. Event layouts auto-switch on the calendar. The plan answers: who's
sitting where, how much stock is on the floor, and what's available tonight.

**Self-hosted, not SaaS.** You own the server, the database, and the data. No
monthly per-seat fees. No internet dependency for on-premises use. The Docker
image pulls from GHCR and boots in one command. A USB GSM modem can handle SMS
bookings without a cloud provider. This is software for a real building, not a
subscription.

---

## Bugs & Quick Fixes ☐

| # | Issue | Where |
|---|-------|-------|
| 1 | Clock out button not working for admin | Worker area |
| 2 | Demo venue not visible when disabled (should still show in structure/admin views) | Structure page |
| 3 | Selection boxes / dropdowns not consistent size across the site | Global UI |
| 4 | Fillable input boxes not consistent size across the site | Global UI |
| 5 | Bookings page margins — looks like full-page bleed, needs proper containment | `/admin/bookings` |
| 6 | Date selection areas look inconsistent across pages — unify the design | Global UI |
| 7 | "You clicked" text on structure map view — remove, replace with cross-connections | Structure → MAP tab |
| 8 | Structure table view missing inline OPEN/EDIT buttons next to item titles | Structure → TREE tab |

---

## Core Platform

### Phase 1 — Foundation ✅
- Multi-venue + multi-department support
- Staff profiles with PIN auth (bcrypt, 2–4 digits)
- Task creation with scheduling (DAILY / WEEKLY / CUSTOM cron)
- QR code generation and worker login flow
- Worker mobile task view with completion types
- Admin dashboard with today's completion stats
- Admin reporting with audit log and CSV export
- Docker Compose deployment
- Soft deletes on every model
- DOS-MODERN design system

### Phase 2 — Intelligence & ERP Upgrade ✅

**Core upgrade:**
- Prisma 7 (PG adapter), Turborepo 2, ESLint 9, Vitest 3, Tailwind CSS 4

**Deep Inventory:**
- `Supplier` model + `SupplierItemCode`, `UnitOfMeasure` with base-unit conversion
- `InventoryItem` deep fields: `costPrice`, `yield%`, `expiryDate`, `allergyInfo`
- Inventory tabs: FOOD / BEVERAGE / OTHER
- Equipment & tool tracking: `imageUrls Json[]` (photo gallery, paste-to-upload), `storageSectionId`, `storageNotes`, `serialNumber`, `purchaseDate`, `warrantyExpiry`, `serviceIntervalDays`, maintenance scheduling, `MaintenanceLog` table, `alternativeSupplierIds Json` with supplier code reordering
- UOM conversion: `countingUnitQty`, `orderingUnitQty`, `parLevelUnitId`
- Category visibility toggles: `showDeepFields` (FOOD/BEVERAGE) vs `showEquipmentFields` (OTHER/TABLES)
- Shelf life: `shelfLifeDays`, `canFreeze`, `freezerShelfLifeDays`
- Restore deleted items: SHOW DELETED toggle with RESTORE / PURGE buttons

**Allergen Management:**
- `AllergenPicker` component with 23 allergens in grouped layout (DAIRY, NUTS, GRAINS, etc.)
- Inherited allergen detection via recursive recipe BOM — locked ⚿ tags with source popup
- LINK TO MENU toggle in recipe editor creates inherited allergen sources

**Recipe Engine:**
- Recursive BOM with cycle detection (`explodeRecipe`)
- Combined Recipe + Menu Item page with LINK TO MENU toggle
- 23-allergen system, WooCommerce product mapping

**WooCommerce Integration:**
- Webhook handler (HMAC auth, order upsert, recipe explosion, auto-seating)
- Two-way product sync (webhooks + REST push with echo guard)
- Internal cron scheduler (15-min pulls + daily expiry scan)
- `/admin/sync` dashboard with PULL/PUSH NOW + live log feed

**Gift Cards:**
- Full lifecycle: bulk-create → issue → send via SMTP → redeem/void
- WooCommerce webhook auto-detection via SKU matching

**Live Service Mode:** ☐
- Kitchen status workflow (PENDING → COOKING → READY → SERVED)

**Pending items:** ☐
- Persistent SMTP settings for gift cards
- WooCommerce order auto-completion on gift card issue
- Inventory deduction during EOD reconciliation
- Time clock & payroll

---

## Operational Board ✅

| Feature | Description |
|---|---|
| Staff notices | Post notices with priority, pin, must-acknowledge flow |
| External embeds | Loaded roster + Google Calendar in iframes |
| Calendar import | `.ics`/webcal parsing with RRULE, synced to planner |
| NZ break entitlements | Auto-calculated rest/meal breaks per shift length |
| Live structure map | TREE tab (Venue→Dept→Section→Staff/Tasks/Training) + MAP tab (React Flow link graph) |
| Split-screen landing | Worker link + admin login on `/` |
| Mobile admin nav | Burger menu + off-canvas drawer |

---

## Section Ecosystem ✅

The model that links sections, tasks, and knowledge into one followed-up loop.
See [ECOSYSTEM.md](ECOSYSTEM.md) for the full design.

- **A · Section layer** — `Section` model under Department, `Task.sectionId`, `Staff⇄Section` M:M
- **B · Knowledge as resources** — `TrainingModule.kind` (TRAINING / SOP / FAQ / HOWTO), attachable to sections, cross-referencable
- **C · Competency link** — `Task⇄Training` "requires" relation, competency = `TrainingCompletion`
- **D · Trigger engine** — `FollowUp` model (MISSED / UNTRAINED / INCORRECT), auto-raised on completion + missed tasks

---

## Checklists & Re-train ✅

- **Tasks + Checklists merged** — Checklists reference live tasks, not copies. Editing a task updates every checklist.
- **Change → re-train** — "Require re-training" toggle bumps version + posts must-acknowledge notice
- **Grouped admin nav** — Collapsible sidebar groups (Overview / Organisation / Work / Daily ops / Finance + Settings)
- **Tasks + Checklists side-by-side** — 50/50 two-column layout, drag tasks into lists, inline checklist editor
- **Department → Section grouping** — Task list nests sections under departments
- **Embedded checklists in training** — `TrainingStep.linkedChecklistId`, renders as in-session tick-off list
- **Shared floor task list** — Whole department sees the list; completion is global per task+date
- **Monthly scheduling** — MONTHLY tasks with 8 option types + every-N-months interval
- **Timed lists** — Checklists surface from a time (`appearFromTime`) and stay until all done
- **Printable PDF export** — `⬇ PDF` button on the Tasks page → modal → per-checklist A4 checkbox list (`GET /api/admin/checklists/[id]/pdf`, jspdf, multi-page)

---

## Floor Planner ✅

### Phase 1 — Editor + Views
- Prisma models: `FloorPlan` + `FloorPlanElement` + enums
- Admin page with list + create + edit
- PixiJS v7 visual editor (room drawn to scale in real cm)
- Drag-from-palette, grid snapping, select→move→resize→rotate
- Worker read-only view with view switcher
- Polygon data model (`shape: POLYGON` + `vertices Json`)

### Phase 1.5 — Styled Elements
- Per-type rendering: tables with legs, chair brackets, booth cushions, door swing arcs, sinks, stairs, etc.
- Walls/Entry/Exit as thick lines with toggleable labels
- Section colour overlay + summary panel
- `style Json?` field for per-type config

### Phase 2 — Inventory, Zones, Calendar, Undo/Redo, PDF
- Full inventory system (`InventoryCategory`, `InventoryItem`, `ElementInventoryItem`)
- Stocktake workflow (create → assign → count → review → sign-off)
- Stock-aware tracking: `availableQty` badges, drop gate when ≤ 0
- Drawn section zones with resize handles + watermarks
- Table↔bench linking with golden dashed connectors
- Calendar event → floor plan linking (admin selector, worker auto-switch)
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- PDF export via jspdf
- PixiJS rewrite — raw PIXI.Application with pointer-delta drag
- Multi-select, edge-aware snapping, rotation presets, DIM overlay
- CAD-style inspector with range sliders + preset buttons
- Custom painted booths via polygon-clipping union

### Phase 2.5 — Inventory-Aware Spatial Planning ✅
- Layered floor plans: `FloorPlanSetup` + `SetupItem` (one base plan, many furniture setups)
- `TableProfile` with BOM (`TableProfileItem`), per-chair/per-table toggle
- Table auto-assignment from number pool
- Magnetic edge snapping + auto-join into `TableGroup`
- Section boundary detection via `pointInPolygon`
- Inventory calculation engine with per-setup shortage reports
- Banquet joinery with union polygons + chair distribution along exposed perimeter
- Head-of-table constraint on rectangular tables
- PixiJS 3-layer canvas (baseLayer / sectionBoundaryLayer / setupLayer)
- 11 new API routes

### Phase 2.6 — Interactive Table Planner Overhaul ✅
- Direct-manipulation chairs (click edges to add/remove)
- Auto-join on proximity → grouped move
- Merged-group rendering (one union outline, redistributed chairs)
- Live per-area totals (N TBL · M PAX badges)
- Two-layer UX (base plan locks in setup mode)
- Per-event auto-layout via `planAutoSeat()` bin-packing generator
- 143 Vitest tests across 25 files

### Phase 2.7 — Floor Planner Polish ✅
- **Ghost tables:** Inventory items render as 20% opacity placeholders on the base plan, showing available furniture at a glance
- **WALLS drawing mode:** Click-to-place wall anchors with auto-connected thick grey segments
- **Polygon section zones:** Freeform polygon drawing alongside rectangular zones; double-click to close
- **Door swing arcs:** 90° dashed quarter-circle showing door open path; sliding doors show parallel arrows
- **20-colour palette:** Fixed palette auto-cycles on zone create; swatches in `SectionZonesList` sidebar
- **Section overlap prevention:** Canvas-level validation on draw/resize — rejects >5% overlap with toast warning
- **Zone grouping by department:** Sidebar groups zones under coloured department headers

### Phase 2.8 — Furniture Unification ⊞ (core built 2026-07-31)

**Done:**
- **One record per piece of furniture** — `TableProfile` folded into `InventoryItem`.
  The two used to be joined only by matching name strings, so stock and geometry
  silently detached on any rename. `FurnitureBomItem` replaces `TableProfileItem`.
- **Table placement works again** — the setup layer's drop handler expected a
  `tp_<id>` drag payload that nothing emitted after Table Profiles moved to
  inventory, so no table could be added to a layout at all. New `FurniturePalette`
  (visual tiles drawing each piece's real outline + `available/total` badges,
  drag-to-canvas or click-to-place) restores the whole chain: tables → groups →
  bookings → auto-seat.
- **Custom furniture** — freeform polygon outlines (`FurnitureShapeEditor`): click
  to place points, drag to adjust, grid-snapped, with live seat/area/perimeter
  readout. L-booths, curved banquettes, sofas, odd bars.
- **Chairs are real furniture** — chair types are inventory items with true cm
  dimensions; each table picks one, chairs draw to scale and are individually
  draggable around the outline (stored as `t` in [0,1), so rotation carries them).
- **Default layout** — `FloorPlanSetup.isDefault`: one per plan, un-deletable,
  owns the venue's real table numbers; event layouts inherit and override.
- **Default chair seeding** — DINING / BANQUET / BARSTOOL / TUB profiles.
- **Removed:** `/admin/table-profiles` page + API, `TableProfileForm` (whose
  chair-edge designer was never included in its save body).

**Still open:** ☐
- **Table builder** — vector editor for laying out condiments, cutlery and place
  settings on a table surface, with item photos. (`ChairSlot.t` gives the anchor
  this needs — a setting can hang off a chair position.)
- **Chair-aware layout** — settings rotate/reposition when chairs move
- **Grouping of items** — salt + pepper + candle as a placeable set
- **Drop `TableProfile` from the schema** — only once every deployment has run
  `db:migrate-furniture` at least once (see CLAUDE.md for why it must linger)

---

## Playbook Guides ✅

- `Guide` + `GuideStep` replace old `TrainingModule` + `TrainingStep`
- Steps simplified to heading, content, imageUrl, videoUrl — no junctions
- Task linking via `TaskGuide` (isRequiredForCompetency: boolean)
- DRAFT/PUBLISHED workflow — nothing goes live accidentally
- Guide completion via `GuideCompletion`, assignment via `GuideAssignment`
- Admin authoring at `/admin/guides`, worker view at `/w/guides`
- Staff management via GUIDES modal on Staff page
- Competency linking wired into task edit form
- Migrated from old `TrainingModule` data via `migrate-to-guides.ts`
- Old tables kept for reference; old UI (`/admin/training`, `/w/training`) still available

**Pending:** ☐
- MyHR onboarding export

---

## Pathways & Positions ✅ (built 2026-08-02)

The onboarding / process tree, plus the spine repair it needed first.

**Spine repair**
- `lib/guides.ts` — one applicability resolver, replacing three drifted copies.
  Fixed: individually-assigned guides never reached the worker's phone
- `lib/followups.ts` now reads `TaskGuide` + `GuideCompletion` — a competency set
  in the Playbook previously raised **no follow-up at all**
- `Guide.version` + re-train notices; guide `PUT` diffs steps so ids stay stable
- Auth added to the publish and delete routes (publish had none)
- Legacy training UI, routes and `lib/training.ts` removed (models kept — the
  migration scripts still read them)

**New**
- `Position` + `StaffPosition` — job roles, many-to-many, managed on `/admin/sections`
- `GuideAudience` — guides target departments, sections **and** positions, several at once
- `GuideStepLink` — one polymorphic table replacing the five legacy step junctions
- `migrate-step-links.ts` recovers the links `migrate-to-guides.ts` dropped
- `Pathway` / `PathwayNode` / `PathwayEdge` + `lib/pathway-progress.ts` (pure, 28 tests)
- `/admin/pathways` — BOARD (React Flow, persisted positions) + TREE
- `/w/guides` — BIBLE + MY TREE (CSS/SVG tech tree, points and levels)
- Structure TREE + MAP repointed at `Guide`; added `position` and `pathway` nodes;
  fixed two unscoped full-table queries and the quadratic tree assembly

**Pending:** ☐
- Radial focus layout on the MAP (click a node, ring its neighbours) — the column
  stack still gets tall with real task volume
- Manager override to unlock a locked tree node for one person
- Badges / rewards on top of the points system

---

## Finance ✅

- 4-model budget schema: `BudgetPeriod` → `BudgetCategory` + `BudgetDay` → `BudgetDayAllocation`
- Categories link to departments or are venue-wide
- Pure math engine: weighted daily allocation, $500 rounding, post-rounding correction
- Two-tier REVENUE + BREAKDOWN structure with auto-REMAINDER
- Dual-mode month selector: grid (landing) + compact (detail)
- 2-column dashboard with ALLOCATION + DAILY WEIGHTING + SUMMARY panels
- Week-card grid with inline breakdowns
- Auto-copy categories across months
- P&L budget lines: hierarchical `BudgetLine` (GROUP/LINE/TOTAL) per period, section-linked
- Excel P&L workbook import (read-excel-file): month-header detection, group/total/% classification, preview + commit, financial-year (Jun–May) mapping

**Pending:** ☐
- Loaded Reports export format
- Labour cost visibility
- Finance area needs purpose defined — payroll? actuals vs budget? (P&L layer built; actuals comparison still open)

---

## Booking System ✅

- `Booking` + `BookingTable` models with status workflow
- Pure availability engine (`lib/booking-availability.ts`, 7 Vitest tests)
- Time-grid diary view at `/admin/bookings` (06:00–24:00, half-hour increments)
- Auto-seat on create reuses `planAutoSeat()` bin-packer with booked-table awareness
- `CalendarEvent` + `FloorPlanSetup` auto-created for calendar + floor plan display
- 3 API routes: list/create, update/delete, availability check
- **TABLE view:** Tables down the left grouped by section, 15-min time columns, click-to-create, drag-edge-to-resize
- **Backup/export:** tar.gz streaming endpoint with all venue data + uploads
- **Customer database:** `/admin/customers` — phone/name search, detail popup with booking history
- **Setup selector:** TABLE view filters by selected FloorPlanSetup, defaults to first (un-deletable) setup
- **Roadmap:** when a `CalendarEvent` links to a specific `FloorPlanSetup` (via `floorPlanSetupId` or `floorPlanSlug`), bookings within that event's time window should resolve against that setup's tables instead of the default. The worker FOH view already auto-switches to the event-linked layout — bookings just need to follow.

**Planned — AI SMS Booking:** ☐
- USB GSM modem (e.g. Huawei E3531 / SIM800) with a data-only or voice+SMS SIM plan attached to the server
- Gammu SMS Daemon (SMSD) polls the modem, writes incoming SMS into PostgreSQL
- Internal cron handler in HOSPO OPS polls the SMS inbox table
- LLM (Deepseek / OpenAI) parses natural-language messages like `"Book for 4 Sat at 7pm"`
- Structured booking data → `POST /api/admin/bookings` (the existing endpoint)
- Gammu sends confirmation reply: `"Table for 4 Sat 7pm — booked. See you then."`
- Zero cloud SMS cost — just the SIM plan

**UI fixes:** ☐
- Fix margins — page looks like full-page bleed, needs proper containment
- Date selection areas — unify design with the rest of the site (match Loaded style but use DOS-MODERN elements)

---

## Phase 5 — Integrations ☐

### Microsoft 365
- **Microsoft Graph API** — read emails and calendar events (read-only)
- **Microsoft Teams notifications** — task overdue alerts to Teams channels
- **Outlook calendar sync** — overlay venue events on task schedule view

### SwiftPOS
- **SwiftPOS deep sync** — roster data → automatic task assignment
- **SwiftPOS SQL sync** — sync from a running SwiftPOS SQL database, map data to HOSPO OPS models
- **Separate .exe sync service** — lightweight Windows service / tray app that runs the SQL sync on a timer, pushing to the HOSPO OPS API

---

## Food Health & Safety Diary ☐

- Digital H&S diary (cooking/cooling temps, cleaning sign-offs, pest checks, staff illness)
- **ESP32 sensor integration:** battery/WiFi ESP32 + DS18B20/SHT sensor nodes POST readings to `/api/sensors/reading`
- Automatic fridge/freezer logging with min/max per day
- Threshold alerts (out-of-range for N minutes → Notice/Follow-up)
- Delivery temperature checks with supplier linking
- Cook/cool probe logging tied to recipes
- Sensor fleet dashboard (battery, last-seen, calibration status)

---

## Phase 6 — Scale ☐

- Multi-tenant SaaS mode (white-label per business)
- Role-based permission system
- Public REST API
- Mobile app wrapper (Capacitor / React Native)
- Offline support via service worker caching

---

## Dashboard Overhaul ☐

Replace the current dashboard with a widget-based system.

### Layout Engine
- **Widget grid** — CSS Grid or react-grid-layout based block areas
- **Drag to move** widgets between grid positions
- **Resize** widgets via drag handles (corner/edge)
- **Edit mode toggle** — EDIT button enters layout mode; widgets lock in view mode
- **Enable/disable** individual widgets — hidden widgets remembered, not deleted
- **Persist layout** per user (save to DB)

### Widgets
| Widget | Description |
|---|---|
| **Activity (Day-by-day)** | Scrollable feed of today's completions, bookings, orders, notices — one row per event with timestamp |
| **Training** | Staff with overdue/incomplete training, recent completions, competency gaps |
| **Par Levels** | Split by department — low-stock items per dept with reorder prompts |
| **Totals** | Headline stats: tasks done today, bookings tonight, staff on shift, orders pending |
| **Weather** | Current conditions + forecast for venue location (API key configured in settings) |
| **Budget / Finance** | Month-to-date revenue vs budget, spend by category, variance indicators |
| **Staff Roster Totals** | Today's shift count by dept, total hours rostered, labour cost estimate |
| **Tasks** | Overdue tasks, today's completion %, unassigned tasks needing attention |

---

## Calendar — Roster View ☐

Weekly roster view styled like Loaded Reports, complementing the existing month grid.

### Layout
- **Days across the top** — Mon–Sun or 7-day rolling window
- **Staff down the left** — sortable by name, department, role
- **Time slots** — row per half-hour (or configurable interval) from open to close
- **Shifts as rectangles** — start time → end time drawn as coloured blocks

### Interaction
- **Click on a cell** (staff × day × time) → pop-up modal with shift details (start/end, break, department, notes)
- **Click on a day header** → coverage view: staff on the left, time across the top, shows staffing density as heatmap/histogram
- **Drag to create** — click and drag across time slots to set shift start/end
- **Staff availability overlay** — unavailable times greyed out so managers can't accidentally roster someone

### Integration
- `Staff.availability` (new model or JSON field) — recurring weekly availability pattern
- Time-off requests visually block out days on the week view
- Links to NZ break calculations (break entitlement shown per shift)

---

## Staff UI Rework ☐

- **Button borders** — all action buttons need visible borders with department/section colour (not invisible ghost buttons)
- **Search** — text search by name, email, role across the staff list
- **Group / filter** — filter staff by department, section, training level (fully trained, partially trained, untrained), role, employment type
- **Training gating on sections** — see Structure rework below

---

## Structure & Sections Rework ☐

### TREE Tab
- **Inline OPEN/EDIT buttons** next to each item title (not separate columns) — clicking only the button navigates, not the name
- **Cross-connection info** — replace "You clicked" text with "USED IN" / "CONNECTED TO" showing other linked items (e.g. "This task appears in 3 checklists: Bar Open, Close Down, Sunday Clean")

### MAP Tab
- **Click-to-focus** — clicking a node centers the view on it
- **Connections float** — connected nodes temporarily reposition around the clicked node in a circular/layout pattern, all visible on screen
- **Greyed connections** — previously clicked connections stay visible but dimmed; clicking a new node adds its connections (not replacing)
- **Clear on outside click** — clicking outside the graph deselects all, returns to default layout
- **Reduce clutter** — when all nodes shown the list gets too long; progressive disclosure via clicks

### Section Training Gating
- **Staff assigned to sections** see 100% of that section's task lists
- **Staff in the department but NOT assigned to the section** — lists are visible but greyed out
- **Training lock** — a list unlocks (becomes active) once the staff member has completed ALL training for that section at least once (not retraining, only first completion counts)
- **Override** — manager can manually unlock; tasks act as unlocked but training record stays untouched (indicates override)
- **Untrained completion trigger** — if an untrained staff member completes a task from a locked section, it initiates training assignment on the manager's follow-ups dashboard

---

## Units of Measure Upgrade ⊞ (partial)

- **Done:** `countingUnitQty`, `orderingUnitQty`, `parLevelUnitId` — base unit / counting unit / ordering unit chains with conversion ratios
- **☐ Volume-to-weight conversions** — cups, tbsp, tsp etc. need density ratios per ingredient (e.g. 1 cup flour ≠ 1 cup sugar in grams)
- **☐ Density field on InventoryItem** — grams per mL for volume ↔ weight math
- **☐ UOM presets** — cups, fluid ounces, pints, quarts, gallons, litres
- **☐ Recipe scaling** — convert between units when scaling recipes up/down

---

## Stocktake Rework ☐

- Review and improve the stocktake workflow end-to-end
- Better counting UX on worker mobile (larger inputs, barcode scan support?)
- Variance review with notes and manager sign-off flow
- Historical stocktake comparison (this count vs last count)

---

## Orders Page Rework ✅ (all 5 phases built)

Turning `/admin/orders` from a read-only Woo mirror into the all-in-one ordering
workspace. Payments remain WooCommerce's job throughout — the app never handles money.

### Phase 1 — Data foundation ✅
- `Customer` model, venue-scoped, with normalised `emailKey` / `phoneKey` match keys
- `lib/customer-match.ts` — email → phone → name precedence, conservative name
  fallback, enrich-blanks-only on match (27 Vitest tests)
- `WooOrder`: nullable `wooOrderId` + `source`/`orderNumber` (manual orders now
  representable), `serviceDate`/`serviceTime`, `fulfillmentType`, and an
  operational lifecycle (`opStatus`, `paymentStatus`, `paymentMethod`, plus
  `paidAt`/`arrivedAt`/`deliveredAt`/`finalisedAt`) kept separate from the
  Woo-mirrored `status`
- `WooOrderItem`: `notes` de-overloaded into `productName` + `explodedIngredients`,
  new `customerNote` / `allergenNote` for per-line allergy requests
- Idempotent backfill script (`npm run db:backfill-orders`)

### Phase 2 — Woo mapping + customer capture ✅
- `WooIntegration.metaFieldMap` + Settings → WooCommerce → ORDER FIELD MAPPING —
  map any plugin's `meta_data` keys to serviceDate / partySize / etc.
  **Required**, not optional: the Tyche delivery-date plugin exposes its field
  under the label configured in its own settings, so a hardcoded key breaks on rename
- `lib/woo-meta-map.ts` — unix seconds/ms, ISO, day-first dates, slot ranges,
  12h/24h times (30 tests)
- Payment read from `date_paid_gmt` (not `date_paid` — store-local, no offset)
- Customers deduped and linked on every sync
- `opStatus` / `fulfillmentType` never overwritten by a sync — operator state survives
- `pushOrderStatus` no-ops for local orders
- Recommended plugin: Order Delivery Date for WooCommerce – Lite (free)

### Phase 3 — Menus + min/max ✅
- `Menu` (minPax / maxPax) + `MenuMenuItem` (minQty / maxQty) — Friday Night
  Bistro vs Event Catering, both menu-level pax range and per-item quantity caps
- `minQty` is a floor once ordered, not a "must order"; duplicate lines summed first
- Pure `lib/menu-rules.ts` (19 tests), admin UI at `/admin/menus`
- **WOO CATEGORIES tab (built 2026-08-06)** — read-only whole-menu view: every
  synced product grouped automatically by its WooCommerce category, with search,
  thumbnails, prices and ON/OFF states. Purely derived from menu items — nothing
  to maintain.

### Phase 4 — The orders page ✅
- One date-driven page, four renderers over one payload: SERVICE (time slots),
  KITCHEN (allergy alerts + dish/category totals), FOH (by table), PRODUCTION (pick list)
- `lib/order-views.ts` — every projection pure and tested (34 tests)
- `OrderView` model — named, saveable filter/grouping presets, shared or private
- Manual orders with `M-0001` refs, server-side menu validation, customer dedupe
- Detail drawer: allergies first, contact, service, progress, payment, items
- Lifecycle stamps (`arrivedAt`/`deliveredAt`/`finalisedAt`) set on first arrival only
- Fixed the unbounded order fetch and the per-line-item `recipe.findUnique` loop —
  now 4 fixed queries; `undatedCount` surfaces orders a date-driven page would hide

### Phase 5 — Integration ✅
- `WooOrder.bookingId` + `lib/order-booking-link.ts` (11 tests) — pre-orders
  attach to the matching reservation, whose tables then take precedence
- Matches on customer/email/phone, never name alone; skips cancelled bookings
- Floor plan tables resolved in the FOH view via booking or the CalendarEvent chain

---

## Services — dated ordering (built 2026-08-06, pipeline continues) ⊞

The app defines *when* a venue takes dated orders and *for which menu*. A
`Service` ("FRIDAY MENU") maps to a Woo category (the menu), runs on weekly
`ServiceSlot` rules (day × start/end × `maxCovers`), and supports one-off
`ServiceException` dates (closed, or open with custom hours). The
`resources/WooPlugin` WordPress plugin renders these as checkout options; the
app is the single source of truth for the schedule.

**Built:**
- Schema: `Service`, `ServiceSlot`, `ServiceException`, `ApiKey` (venue-scoped,
  hashed), `Venue.autoSeat` (default off — Woo orders no longer auto-seat),
  `WooOrder.serviceId` + `bookTable`
- `/admin/services` — per-venue authoring (venue must be selected from the main
  selection bar): ADD A DAY → time slots per day with START/END/MAX COVERS,
  date exceptions, Woo category = the menu
- MAX COVERS = **people** per slot (sum of party sizes of orders + bookings),
  not the number of orders

**Pipeline:**
- **Bookings page top bar** — each service shows its label + live available
  covers for the selected day (the same availability math the plugin uses)
- **Event override** — when a `CalendarEvent`/event layout is active on a date,
  it overrides that service's times and **blocks bookings for that date**
- **Built:** public API (ApiKey auth) — `GET /api/public/config`,
  `GET /api/public/availability`, `POST /api/public/bookings`
- **Built:** WooCommerce plugin `resources/WooPlugin` — settings (app URL +
  API key + TEST CONNECTION), checkout dining details (service/date/slot/party
  + optional book-a-table, `_hospo_*` meta), booking-only widget (shortcode
  `[hospo_booking]` + Gutenberg block + sidebar widget, Divi-friendly)
- **Built:** order sync — `_hospo_*` meta mapping (default map + Settings rows),
  auto-seat gated behind `Venue.autoSeat` (default off), booking creation when
  book-a-table is chosen, service name on order cards + admin order column
- **Built:** confirmation emails carry the dining details (service, date, time,
  party size, table booking) via `woocommerce_email_after_order_table`
- **Customer self-service (pipeline):** the confirmation email links to a
  WordPress page where customers review and adjust their pre-order / booking —
  change service, date, time slot or party size, subject to venue controls:
  a **cut-off window** (no changes within X hours of the service time), and
  per-field lockdown (which fields can be edited, whether a date change may
  exceed slot covers). Updates push to the app via the public API (PATCH
  order meta + booking time) and log to the SyncLog feed.
- **WooCommerce Blocks checkout support (pipeline):** the classic
  `[woocommerce_checkout]` shortcode carries the dining fields natively; the
  Blocks checkout has no `form.checkout`, so a Blocks integration
  (`IntegrationInterface` + checkout data extension) is needed for stores
  that don't use the shortcode.
- **Built (2026-08-06):** Blocks checkout integration — the official
  `register_checkout_field` API (service/date/time/party/book fields,
  auto-rendered + validated + saved by the Store API), a no-build script that
  keeps the service→date→time options live from the app (MutationObserver
  survives React re-renders), and a Store API hook that copies the fields
  into `_hospo_*` order meta. Gated by the "Show dining details on checkout"
  setting. Known small gap: required-booking services don't auto-tick the
  book-a-table checkbox on Blocks yet.

---

## WooCommerce Sync Consolidation ☐

- **All WooCommerce settings in one place** — remove partial settings from the main Settings page
- **Dedicated WooCommerce page** under Settings: `/admin/settings/woocommerce`
- **Per-venue connection settings** — API keys, webhook secret, store URL, all on one page
- **Debug + log viewer** — combined sync log and webhook debug on the same page
- **Category mapping** — link imported Woo product categories to HOSPO OPS categories (including Gift Card category mapping)
- **Product link review** — review table showing Woo product → HOSPO menu item links, flag broken/missing links

---

## Gift Card PDF Customization ☐

- **Import master PDF** — upload a PDF template with editable regions
- **Define editable areas** — mark coordinates/regions on the PDF where HOSPO OPS prints dynamic data (gift card code, amount, expiry, venue name)
- **Preview** — generate a preview PDF with sample data before bulk printing
- **Bulk generate** — select issued gift cards → generate PDF for printing
- **Historical imports** — import existing gift card numbers/codes that were issued outside the system

---

## Notices & Follow-Ups Rework ☐

- Redesign the notices UI for both admin and worker
- Improve follow-ups dashboard — better grouping, filtering, bulk actions
- Notification delivery options (in-app, email, push — groundwork for Teams/etc.)

---

## Worker Stock & Orders View ☐

- **Worker stock view** — staff can see current stock levels for items in their department/section
- **Recipe viewer** — staff can view recipes for menu items (read-only, with ingredient list and method)
- **Order viewer** — staff can see today's orders and their statuses

---

## Suppliers ☐

- Review supplier management page — may need to move from current location
- Supplier performance tracking (on-time delivery, quality, pricing history)

---

## UI Consistency Pass ☐

| # | Issue | Fix |
|---|-------|-----|
| 1 | Dropdown / Select boxes vary in height across pages | Standardise all Select components to same height |
| 2 | Text inputs vary in height across pages | Standardise all Input components to same height |
| 3 | Date pickers / date selection areas inconsistent | Unify date selection pattern (match Loaded style with DOS-MODERN elements) |
| 4 | Bookings page — full-width bleed, needs contained layout | Add proper max-width centering and padding |
| 5 | Button border visibility — some action buttons lack visible borders | Ensure all buttons have visible borders using department/status colours |
| 6 | Dropdowns + inputs use `font-sans text-sm` while buttons are `font-mono` uppercase | ✅ done 2026-08-06 — shared `Select` + `Input` + `Textarea` now match button style (`font-mono text-xs`, `px-3 py-1.5`) |

---

## Technical Debt & Recent Fixes

- No cron engine — task scheduling filtered on read, not pre-generated
- File uploads are local disk only
- No rate limiting on PIN login
- Konva + react-konva removed; PixiJS v7 rewrite complete
- ESLint 9 flat config, Prisma 7 PG adapter, Tailwind CSS 4
- `docker-entrypoint.sh` runs budget data migration before `prisma db push`
- CI quality gate: `lint && test` runs before Docker build
- `SearchSelect` inline dropdown component for supplier/category selects
- Blue border only on active task filter Selects (removed from base Select default)
- Ghost tables (20% opacity inventory preview), WALLS drawing mode, polygon zones, door swing arcs
- `POST /api/admin/inventory/[id]/restore` — restore soft-deleted items
- `MaintenanceLog` tracking per inventory item with auto-calculated `nextServiceAt`
- Backup: `GET /api/admin/backup` (tar.gz) + `GET /api/admin/seed-export` (SQL dump)
