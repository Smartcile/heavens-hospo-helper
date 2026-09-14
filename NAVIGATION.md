# HOSPO OPS — FULL NAVIGATION MAP

Everything a user can navigate to, what it does, and how it's organised.
Use this as the source of truth for re-organising the IA.

---

## 1. ADMIN PANEL (desktop, /admin) — left sidebar

Two render modes: static sidebar on desktop, burger-drawer on mobile.

Clicking a **group header** jumps to that group's first subpage (deep-linked
with its default sub-tab, e.g. OPS HUB → Menu & Services → RECIPES); the
`▸/▾` button beside the header expands/collapses the group.

```
┌──────────────────────────────────────────────────────────────┐
│ BRAND / VENUE SWITCHER  (top of sidebar — sets active venue) │
├──────────────────────────────────────────────────────────────┤
│ ▾ DASHBOARD (the "Now")                                       │
│     OVERVIEW          /admin                                 │
│     CALENDAR          /admin/calendar                        │
│     KITCHEN           /w/kitchen (worker view)               │
│ ▾ OPS HUB (the "Doing")                                       │
│     MENU & SERVICES   /admin/ops?tab=menu                    │
│     BOOKINGS          /admin/ops?tab=bookings                │
│     ORDERS            /admin/ops?tab=orders                  │
│     CUSTOMERS         /admin/ops?tab=customers               │
│     INVENTORY & STKTE /admin/ops?tab=inventory               │
│ ▾ TEAM & EXECUTION (the "People")                             │
│     ROSTER & PAY      /admin/team — STAFF·ROSTER·CLOCKS·PAY   │
│     DAILY TASKS       /admin/execution — TASKS·REVIEW·FOLLOW-UP│
│     TRAINING          /admin/training — PLAYBOOK·PATHWAYS    │
│     NOTICES           /admin/notices                         │
│ ▾ COMPLIANCE (the "Safe")                                      │
│     FOOD SAFETY       /admin/compliance — TASKS·DELIVERIES·   │
│                       ALERTS·LOGGERS                          │
│ ▾ PERFORMANCE (the "Results")                                 │
│     REPORTS · BUDGET · GIFT CARDS                             │
│ ▾ SETUP & CONFIG (the "Plumbing" — bottom)                    │
│     FLOOR PLANS       /admin/settings?tab=floorplans          │
│     SETTINGS          /admin/settings — 8 tabs (below)        │
│ SIGN OUT                                                     │
└──────────────────────────────────────────────────────────────┘
```

### DASHBOARD group

| Item | URL | What it does |
|---|---|---|
| **Overview** | `/admin` | Landing page. Venue overview: today's due tasks, overdue/missed last 7 days, par-level alerts, stocktake pending, guides completion %, timeclock summary, orders/booking quick stats. Quick actions: + TASK, + STAFF, + QR CODE (jump to the hubs) |
| **Calendar** | `/admin/calendar` | Month calendar combining staff shifts (roster) + time-off requests + calendar events. Manage shifts, approve/decline time off. Tabs: PLANNER (event calendar), LOADED ROSTER (iframe embed), EVENTS (Google Calendar embed). Syncs external feeds (.ics / Google) server-side. Shows NZ rest/meal break entitlements per shift |
| **Kitchen** | `/w/kitchen` | Worker-side kitchen view opened from admin: today's order items grouped by table with allergy badges, prep totals grid, auto-refresh 15s |

### OPS HUB group

The five daily-operations areas are sidebar items (each deep-links into
`/admin/ops` with its `?tab=` preset). A page's sticky top bar shows **only
that area's fine tabs** (section 2). Old standalone pages redirect here.

| Item | URL | What it does |
|---|---|---|
| **Menu & Services** | `/admin/ops?tab=menu` | RECIPES · MENUS & CATEGORIES · SERVICES (see section 2) |
| **Bookings** | `/admin/ops?tab=bookings` | DIARY · TABLE · DELETED (see section 2) |
| **Orders** | `/admin/ops?tab=orders` | ALL · SERVICE · KITCHEN · FOH · PRODUCTION (see section 2) |
| **Customers** | `/admin/ops?tab=customers` | Customer search by phone/name (a leaf — no top bar) |
| **Inventory & Stocktake** | `/admin/ops?tab=inventory` | INVENTORY · STOCKTAKE (see section 2) |

### TEAM & EXECUTION group

| Item | URL | What it does |
|---|---|---|
| **Roster & Pay** | `/admin/team` | STAFF: staff directory + CRUD (role, email/PIN logins, employment, multi-venue, external IDs, GUIDES sign-off modal, ACCESS controls drawer — ADMIN grants a manager per-area access: RESTRICTED toggle, per-venue permission tree with presets). ROSTER: staff × 7-day shift grid with coloured blocks, PUBLISH/DRAFT weeks, cost vs budget footer, ANALYZE/VISUALIZE, PRINT. CLOCKS: per-day timeclock table with APPROVE/REJECT/EDIT, deleted clocks, edits audit, + ADD CLOCK. PAYROLL: NZ pay periods from APPROVED clocks, PAYE/ACC/KiwiSaver engine, PAYSLIP + CSV export, PUBLIC HOLIDAYS + ALT DAYS + SETTINGS tabs. **No in-page venue select** — switching venues is the sidebar `VenueSwitcher` (all four tabs re-read the `admin-active-venue` cookie) |
| **Daily Tasks** | `/admin/execution` | TASKS: live tasks (Department → Section) + checklists (ordered live-task references) with PDF export. REVIEW: end-of-day review per staff with notes + guide assignment. FOLLOW-UPS: competency/missed-task queue with RE-SCAN, sign-off/resolve |
| **Training** | `/admin/training` | PLAYBOOK: SOP/guide library with DRAFT/PUBLISHED workflow, audiences (dept/section/position), steps + links, competency flags, live "ON THE WORKER PHONE" visibility readout. Editor is a full-height drawer. Per-card ⬇ PDF + checkboxes for a merged bulk PDF (`?ids=a,b,c` or all published). PATHWAYS: onboarding/progression trees — BOARD drag-editor (cards carry ↑/↓ stage shift + ✕ delete, positions persist) + TREE outline (per-row ↑/↓ reorder, S−/S+ stage, inline EDIT, ✕ delete), prerequisites, points |
| **Notices** | `/admin/notices` | Announcements to floor staff: priority levels, department targeting, acknowledgement tracking (GOT IT). Re-train notices auto-post here |

### COMPLIANCE group (Food Health & Safety)

| Item | URL | What it does |
|---|---|---|
| **Food Safety** | `/admin/compliance` | Chomp-style H&S hub, NZ GFMP. TASKS: the Task Manager — health widget (TASKS PROVED / WITH ALERTS), ACTIVE·DRAFT·ARCHIVED tabs, TABLE/GRID views, tasks grouped FOOD/EQUIPMENT/TEAM/FACILITY with per-category + ADD, READING tasks with pass bands + critical danger bands (GFMP presets), PASS badges from the last 7 days, linked products/equipment, per-row EDIT/DUPE/ARCHIVE/DEL. DELIVERIES: supplier receipts with vehicle + per-line temperature checks (CHILLED ≤5°C, FROZEN ≤-18°C), PASS/FAIL verdicts, ACCEPT/REJECT, failed lines auto-raise alerts. ALERTS: open/resolved feed (WARNING/CRITICAL, OUT_OF_RANGE/DELIVERY_TEMP), resolve with note, manual raise. LOGGERS: placeholder until the sensor fleet ships (Phase 3) |

### PERFORMANCE group

| Item | URL | What it does |
|---|---|---|
| **Reports** | `/admin/reports` | Reporting suite (stock, sales, labour reports) |
| **Budget** | `/admin/budget` | Monthly weighted budget tool: REVENUE target + % category breakdowns, daily weighting profile, auto-generated daily allocations, progress vs variance, month grid |
| **Gift Cards** | `/admin/gift-cards` | Gift card issue/redeem lifecycle. **ISSUE GIFT CARD** opens a popup (details + amount + template preview); **CREATE GIFT CARDS** is a split SINGLE/BULK control (premakes the next `2026####`-style numbers). The YEAR filter defaults to the current venue-year (ALL available) so a refresh always shows this year's cards. Click a card → popup: edit details + private notes, status buttons (**REPLACE CARD** voids it and issues the next premade card as a corrected replacement, keeping the WooCommerce order link — resend the order email from the store to deliver the new PDF; **RESET** blanks it back to a DRAFT with the same number and history kept; **DELETE** for VOIDED cards only), the linked WooCommerce order, and a merged history feed where every row is labelled **CARD · APP / ORDER · APP / ORDER · STORE** so app actions and store activity are unmistakable. Fillable PDF templates with field mapping + LIVE preview, REPLACE/REMOVE FILE. WooCommerce box: category link, **variable gift card product** (editable name, short description, product image — paste-supported — and denominations, SAVE pushes to the store), and **SYNC WOOCOMMERCE (GIFT CARDS + ORDERS)** which pulls orders only. Products stay hidden from recipes/menus/order pickers; store purchases auto-combine into ONE issued card per order (pending-payment orders included) and the store emails carry the PDF. A PENDING PAYMENT ORDERS box (loaded live — CONFIRM PAYMENT issues the card) and a GIFT ORDERS tab (every synced gift order: line breakdown, statuses, linked cards) sit on the same page |

### SETUP & CONFIG group (bottom)

| Item | URL | What it does |
|---|---|---|
| **Floor Plans** | `/admin/settings?tab=floorplans` | To-scale venue editor (PixiJS canvas): walls, doors, section zones, tables. BASE layer + SETUPS (event layouts). Furniture from inventory palette, snapping, auto-join groups, BOM shortages, zone pax totals, undo/redo, PDF export. Lives as a tab of SETTINGS — `/admin/floorplan` redirects here |
| **Settings** | `/admin/settings` | 8 tabs — GENERAL · STRUCTURE · FLOOR PLANS · UNITS OF MEASURE · SUPPLIERS · QR CODES · SYNC · FILES (admin) (section 3) |

---

## 2. OPS HUB — one sticky top bar per area (`/admin/ops`)

The **areas** are chosen in the sidebar; the page's sticky top bar shows that
area's **fine tabs** only (CUSTOMERS is a leaf — no bar). Sub-tab = URL
(`/admin/ops?tab=bookings&sub=deleted`) so refresh/back/bookmark work.

```
┌──────────────────────────────────────────────────────────────────────┐
│ MENU & SERVICES →  RECIPES | MENUS & CATEGORIES | SERVICES            │
│ BOOKINGS →        DIARY | TABLE | DELETED                             │
│ ORDERS →          ALL | SERVICE | KITCHEN | FOH | PRODUCTION          │
│ INVENTORY & STOCKTAKE →  INVENTORY | STOCKTAKE                        │
│ CUSTOMERS →       (no top bar)                                        │
└──────────────────────────────────────────────────────────────────────┘
```

Flow order: **Sell → Seat → Serve → Stock**.

| Tab | URL | What it does |
|---|---|---|
| **MENU & SERVICES** | `/admin/ops?tab=menu` | RECIPES: master-detail recipe editor — ingredient BOM (inventory + PANTRY BIBLE references + sub-recipes), yield, allergens (inherited resolution), LINK TO MENU (price, Woo product/category/image/variations). MENUS & CATEGORIES: pax-range menus, Woo category linking, unlinked-category rescue. SERVICES: dated ordering services (weekly slots, date exceptions, table plan, booking interval, BOOKING REQUIRED) |
| **BOOKINGS** | `/admin/ops?tab=bookings` | Table reservations. DIARY (timeline), TABLE (tables × time grid with service windows, click-to-create, drag-resize), DELETED (recover with reseat + clash guard). Booking cards have a CUSTOMER button → slide-out customer drawer. Creates calendar events |
| **ORDERS** | `/admin/ops?tab=orders` | Date-driven orders. Views: ALL / SERVICE / KITCHEN / FOH / PRODUCTION. Filters, saved views, + NEW ORDER. Detail popout: contact (VIEW CUSTOMER → drawer), booking controls, progress buttons, payment, items, Woo status push |
| **CUSTOMERS** | `/admin/ops?tab=customers` | Customer search by phone/name; detail opens the slide-out customer drawer (contact + booking history) |
| **INVENTORY & STOCKTAKE** | `/admin/ops?tab=inventory` | INVENTORY: master-detail stock system (FOOD/BEVERAGE/OTHER categories, AVAIL = total − placed, deep fields, equipment tracking, furniture form, SHOW DELETED) + a read-only **PANTRY BIBLE** section listing the known-ingredient density library (gold `PANTRY BIBLE` tags; regular items are tagged `CUSTOM`). STOCKTAKE: create/count/variance/sign-off |

All areas follow the sidebar's active venue; old standalone URLs redirect here
keeping other query params.

---

## 3. SETTINGS — the 8 tabs (`/admin/settings`)

| Tab | What it does |
|---|---|
| **GENERAL** | Integrations (Google/iCal/Loaded embeds + refresh), WooCommerce (store keys, webhook secret, order field mapping, API keys — plugin-paired stores show MANAGED BY PLUGIN read-only with MANUAL OVERRIDE), DEMO VENUE, BACKUP & RESTORE, VENUE SHARING, NZ break entitlements, default venue, change password/PIN |
| **STRUCTURE** | The org tree + workflow node map (TREE/MAP) — moved here from the sidebar |
| **FLOOR PLANS** | The to-scale venue layout editor (list + PixiJS canvas) — moved here from the sidebar; grant-gated like the old sidebar item |
| **UNITS OF MEASURE** | UOM list + CRUD with base-unit ratios and kind (VOLUME/MASS/COUNT) |
| **SUPPLIERS** | Supplier list + CRUD (used by inventory equipment tracking) |
| **QR CODES** | Worker login QR generation/download per venue |
| **SYNC** | WooCommerce sync console (PULL PRODUCTS / PULL ORDERS / PUSH PRODUCTS, live SyncLog) — moved here from OPS HUB |
| **FILES** | File manager (admin only — hidden from managers) — tree over the server's media + backups folders. Click a file to preview it in a popup (images/PDFs) with **usage tags** (gift card templates, issued card PDFs, product/staff/guide/task photos). DELETE is disabled for linked files |

---

## 4. WORKER APP (phone, /w) — QR + PIN login

```
┌──────────────────────────────────┐
│ WORKER DASHBOARD (home)          │
│   ≡ HAMBURGER MENU:              │
│   ┌────────────────────────────┐ │
│   │ DASHBOARD                  │ │
│   │ TASKS                      │ │
│   │ GUIDES      (bible+tree)   │ │
│   │ KITCHEN                    │ │
│   │ STOCKTAKE                  │ │
│   │ CALENDAR                   │ │
│   │ FLOOR PLAN                 │ │
│   │ NOTICES                    │ │
│   │ TIMECLOCK                  │ │
│   └────────────────────────────┘ │
└──────────────────────────────────┘
```

| Item | URL | What it does |
|---|---|---|
| **Login** | `/w/login?token=…` | Public. Venue picker → QR code → staff PIN → JWT session cookie (15 min inactivity auto-logout) |
| **Dashboard** | `/w/dashboard` | Today's due tasks per department, guides % complete, pending stocktake, notices, clock state |
| **Tasks** | `/w/tasks` | Whole-floor due tasks grouped by Checklist → Department → Section; shared completion ("BY NAME"). READING tasks (fridge/freezer temps, probe calibration) show a big numeric input with a live PASS/FAIL verdict as you type; an out-of-range reading raises an alert (CRITICAL also posts an URGENT notice) |
| **Deliveries** | `/w/deliveries` | Receive stock on the floor: supplier picker, vehicle temp, search products, per-line qty/temp/disposition with live verdicts, RECORD DELIVERY. Failed lines raise alerts the manager resolves in the Compliance hub |
| **Guides** | `/w/guides` | BIBLE (every applicable published guide — tracked ones are completable, untracked REFERENCE SOPs/FAQs/HOWTOs appear under "REFERENCE — READ ANY TIME" and open read-only; step reader shows linked tasks/tools/lists, MARK COMPLETE) + MY TREE (pathway progress, locked nodes readable but not bankable) |
| **Kitchen** | `/w/kitchen` | Today's order items by table, allergy badges, prep totals. Auto-refresh 15s |
| **Stocktake** | `/w/stocktake` | Assigned stocktakes: count list, submit IN_PROGRESS / COMPLETED |
| **Calendar** | `/w/calendar` | My upcoming shifts + request/cancel time off |
| **Floor Plan** | `/w/floorplan` | Read-only plan: zoom/pan, setup switcher, event-mode banner |
| **Notices** | `/w/notices` | Announcements with GOT IT acknowledgement |
| **Timeclock** | `/w/timeclock` | Clock in/out, breaks (NZ rules), today's hours, history |
| **Gift Cards** | /w/giftcards | Issue a physical gift card (permission-only tile): shows the lowest-numbered draft, buyer + amount, ISSUE → VIEW / PRINT PDF |


---

## 5. PAGES THAT EXIST BUT ARE REDIRECTS

Every page merged into a hub keeps its URL as a redirect that forwards query params:

| Old URL | Redirects to |
|---|---|
| `/admin/recipes`, `/admin/menu-items` | `/admin/ops?tab=menu&sub=recipes` |
| `/admin/menus` | `/admin/ops?tab=menu&sub=menus` |
| `/admin/services` | `/admin/ops?tab=menu&sub=services` |
| `/admin/bookings` | `/admin/ops?tab=bookings` |
| `/admin/orders` | `/admin/ops?tab=orders` |
| `/admin/customers` | `/admin/ops?tab=customers` |
| `/admin/inventory` | `/admin/ops?tab=inventory&sub=inventory` |
| `/admin/stocktake` | `/admin/ops?tab=inventory&sub=stocktake` |
| `/admin/staff` | `/admin/team?tab=staff` |
| `/admin/roster` | `/admin/team?tab=roster` |
| `/admin/clocks` | `/admin/team?tab=clocks` |
| `/admin/payroll` | `/admin/team?tab=payroll` |
| `/admin/tasks`, `/admin/templates` | `/admin/execution?tab=tasks` |
| `/admin/review` | `/admin/execution?tab=review` |
| `/admin/followups` | `/admin/execution?tab=followups` |
| `/admin/guides` | `/admin/training?tab=playbook` |
| `/admin/pathways` | `/admin/training?tab=pathways` |
| `/admin/structure` | `/admin/settings?tab=structure` |
| `/admin/uoms` | `/admin/settings?tab=uoms` |
| `/admin/suppliers` | `/admin/settings?tab=suppliers` |
| `/admin/qrcodes` | `/admin/settings?tab=qrcodes` |
| `/admin/sync` | `/admin/settings?tab=sync` |
| `/admin/floorplan` | `/admin/settings?tab=floorplans` |

| URL | Status | Notes |
|---|---|---|
| `/admin/departments` | real page, not in sidebar | Departments managed inside other pages |
| `/admin/sections` | real page, not in sidebar | Sections + positions used by staff/task forms |
| `/api/public/*` | API only | Public booking widget + availability + config + WooCommerce plugin pairing (`/api/public/woocommerce/connect`) |
| `/api/webhooks/woocommerce` | API only | WooCommerce webhook receiver |
| `/api/cron/*` | API only | External scheduler fallback (bearer-token) |

---

## 6. FLOW NOTES FOR RE-ORGANISATION

- **Venue switching is global** — the sidebar switcher drives every page (cookie `admin-active-venue`).
- **Every hub's tabs live in one file**: `apps/web/lib/hub-tabs.ts` (`OPS_TABS`, `TEAM_TABS`, `EXECUTION_TABS`, `TRAINING_TABS`, `SETTINGS_TABS`) — labels, order and sub-tabs are one array each.
- **The sidebar structure lives in one place**: `NAV_GROUPS` in `apps/web/components/admin/AdminNav.tsx`.
- **Drawers**: `components/ui/Drawer.tsx` (right slide-over) + `components/admin/CustomerDrawer.tsx` (contact + booking history) — used from Bookings, Orders, Customers.
- Worker app and admin panel share no navigation code — worker menu is per-page hamburger.
