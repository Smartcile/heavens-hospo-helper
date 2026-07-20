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
- Equipment & tool tracking: `imageUrl`, `storageSectionId`, `storageNotes`, `serialNumber`, `purchaseDate`, `warrantyExpiry`, `serviceIntervalDays`, maintenance scheduling

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

### Phase 2.7 — Floor Planner Rework ☐
- **Remove Table Profiles tab** from floor planner — move to inventory area under FURNITURE
- **Table builder** — vector/Canvas editor for laying out condiments, cutlery, and place settings on a table surface. Items are draggable on the table canvas. Visual top-down view changes based on chair positions.
- **Chair-aware layout** — cutlery/condiments link to chair positions so the visual rotates/repositions when chairs move
- **Grouping of items** — e.g. salt + pepper + candle as a set that can be placed together
- **Default chair data seeding** — pre-populated chair dimension profiles (standard, barstool, banquet)

---

## Training ✅ (needs rework)

- Step-by-step guides with photo uploads + video links
- Assignment: onboarding, department-scoped, or individually assigned
- Self-complete vs. manager sign-off per module
- Worker view at `/w/training` with progress bar
- Completion tracking per person on Staff page
- `TaskRequiredTraining` competency linking
- `StepInventoryItem` junction — training steps can reference tools/equipment from inventory with photo, storage location, supplier

**Pending:** ☐
- MyHR onboarding export
- Reordering / required-for-role gating

**Training Rework:** ☐
- Add descriptions for each `TrainingModule.kind` (TRAINING / SOP / FAQ / HOWTO) so managers understand what each type is for
- Rename the area — "Resources" or "Guides" instead of just "Training"
- Better organisation of the training list — filters, grouping, search
- Reorganise the admin page layout for clarity

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

**Pending:** ☐
- Loaded Reports export format
- Labour cost visibility
- Finance area needs purpose defined — payroll? P&L? actuals vs budget?

---

## Booking System ✅

- `Booking` + `BookingTable` models with status workflow
- Pure availability engine (`lib/booking-availability.ts`, 7 Vitest tests)
- Time-grid diary view at `/admin/bookings` (06:00–24:00, half-hour increments)
- Auto-seat on create reuses `planAutoSeat()` bin-packer with booked-table awareness
- `CalendarEvent` + `FloorPlanSetup` auto-created for calendar + floor plan display
- 3 API routes: list/create, update/delete, availability check

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

## Units of Measure Upgrade ☐

- **Volume-to-weight conversions** — cups, tbsp, tsp etc. need density ratios per ingredient (e.g. 1 cup flour ≠ 1 cup sugar in grams)
- **Density field on InventoryItem** — grams per mL for volume ↔ weight math
- **UOM presets** — cups, fluid ounces, pints, quarts, gallons, litres
- **Recipe scaling** — convert between units when scaling recipes up/down

---

## Stocktake Rework ☐

- Review and improve the stocktake workflow end-to-end
- Better counting UX on worker mobile (larger inputs, barcode scan support?)
- Variance review with notes and manager sign-off flow
- Historical stocktake comparison (this count vs last count)

---

## Orders Page Rework ☐

- Full redesign of `/admin/orders`
- Better order card layout with clearer status, items, and actions
- Improved FOH view with table map integration
- Order timeline / audit trail

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

---

## Technical Debt & Recent Fixes

- No cron engine — task scheduling filtered on read, not pre-generated
- File uploads are local disk only
- No rate limiting on PIN login
- Konva + react-konva removed; PixiJS v7 rewrite complete
- ESLint 9 flat config, Prisma 7 PG adapter, Tailwind CSS 4
- `docker-entrypoint.sh` runs budget data migration before `prisma db push`
- CI quality gate: `lint && test` runs before Docker build
