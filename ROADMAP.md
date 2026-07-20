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

---

## Training ✅

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

---

## Phase 5 — Integrations ☐

- **Microsoft Graph API** — read emails and calendar events (read-only)
- **Microsoft Teams notifications** — task overdue alerts to Teams channels
- **Outlook calendar sync** — overlay venue events on task schedule view
- **SwiftPOS deep sync** — roster data → automatic task assignment

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

## Technical Debt & Recent Fixes

- No cron engine — task scheduling filtered on read, not pre-generated
- File uploads are local disk only
- No rate limiting on PIN login
- Konva + react-konva removed; PixiJS v7 rewrite complete
- ESLint 9 flat config, Prisma 7 PG adapter, Tailwind CSS 4
- `docker-entrypoint.sh` runs budget data migration before `prisma db push`
- CI quality gate: `lint && test` runs before Docker build
