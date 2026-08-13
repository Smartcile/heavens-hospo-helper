# HOSPO OPS — FULL NAVIGATION MAP

Everything a user can navigate to, what it does, and how it's organised.
Use this as the source of truth for re-organising the IA.

---

## 1. ADMIN PANEL (desktop, /admin) — left sidebar

Two render modes: static sidebar on desktop, burger-drawer on mobile.

```
┌──────────────────────────────────────────────────────────────┐
│ BRAND / VENUE SWITCHER  (top of sidebar — sets active venue) │
├──────────────────────────────────────────────────────────────┤
│ ▾ DASHBOARD (the "Now")                                       │
│     OVERVIEW          /admin                                 │
│     CALENDAR          /admin/calendar                        │
│     KITCHEN           /w/kitchen (worker view)               │
│ ▾ OPS HUB (the "Doing")                                       │
│     OPS HUB           /admin/ops — 5 tabs (below)            │
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
│     FLOOR PLANS       /admin/floorplan                       │
│     SETTINGS          /admin/settings — 6 tabs (below)       │
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

| Item | URL | What it does |
|---|---|---|
| **OPS HUB** | `/admin/ops` | The combined daily-operations page — 5 tabs (full detail in section 2). Tab = URL (`/admin/ops?tab=orders`) so refresh/back/bookmark work. Old standalone pages redirect here |

### TEAM & EXECUTION group

| Item | URL | What it does |
|---|---|---|
| **Roster & Pay** | `/admin/team` | STAFF: staff directory + CRUD (role, email/PIN logins, employment, multi-venue, external IDs, GUIDES sign-off modal). ROSTER: staff × 7-day shift grid with coloured blocks, PUBLISH/DRAFT weeks, cost vs budget footer, ANALYZE/VISUALIZE, PRINT. CLOCKS: per-day timeclock table with APPROVE/REJECT/EDIT, deleted clocks, edits audit, + ADD CLOCK. PAYROLL: NZ pay periods from APPROVED clocks, PAYE/ACC/KiwiSaver engine, PAYSLIP + CSV export, PUBLIC HOLIDAYS + ALT DAYS + SETTINGS tabs |
| **Daily Tasks** | `/admin/execution` | TASKS: live tasks (Department → Section) + checklists (ordered live-task references) with PDF export. REVIEW: end-of-day review per staff with notes + guide assignment. FOLLOW-UPS: competency/missed-task queue with RE-SCAN, sign-off/resolve |
| **Training** | `/admin/training` | PLAYBOOK: SOP/guide library with DRAFT/PUBLISHED workflow, audiences (dept/section/position), steps + links, competency flags. Editor is a full-height drawer. PATHWAYS: onboarding/progression trees (BOARD drag-editor + TREE outline), prerequisites, points |
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
| **Gift Cards** | `/admin/gift-cards` | Gift card issue/redeem lifecycle: batches, issue, email, mark redeemed, PDF card |

### SETUP & CONFIG group (bottom)

| Item | URL | What it does |
|---|---|---|
| **Floor Plans** | `/admin/floorplan` | To-scale venue editor (PixiJS canvas): walls, doors, section zones, tables. BASE layer + SETUPS (event layouts). Furniture from inventory palette, snapping, auto-join groups, BOM shortages, zone pax totals, undo/redo, PDF export |
| **Settings** | `/admin/settings` | 6 tabs — GENERAL · STRUCTURE · UNITS OF MEASURE · SUPPLIERS · QR CODES · SYNC (section 3) |

---

## 2. OPS HUB — the 5 tabs (`/admin/ops`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ MENU & SERVICES · BOOKINGS · ORDERS · CUSTOMERS · INVENTORY &         │
│ STOCKTAKE                     (sticky tab bar, scrollable)            │
├──────────────────────────────────────────────────────────────────────┤
│ MENU & SERVICES:  RECIPES | MENUS & CATEGORIES | SERVICES             │
│ INVENTORY & STOCKTAKE:  INVENTORY | STOCKTAKE                         │
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

All 5 tabs follow the sidebar's active venue; old URLs redirect here keeping other query params.

---

## 3. SETTINGS — the 6 tabs (`/admin/settings`)

| Tab | What it does |
|---|---|
| **GENERAL** | Integrations (Google/iCal/Loaded embeds + refresh), WooCommerce (store keys, webhook secret, order field mapping, API keys), DEMO VENUE, BACKUP & RESTORE, VENUE SHARING, NZ break entitlements, default venue, change password/PIN |
| **STRUCTURE** | The org tree + workflow node map (TREE/MAP) — moved here from the sidebar |
| **UNITS OF MEASURE** | UOM list + CRUD with base-unit ratios and kind (VOLUME/MASS/COUNT) |
| **SUPPLIERS** | Supplier list + CRUD (used by inventory equipment tracking) |
| **QR CODES** | Worker login QR generation/download per venue |
| **SYNC** | WooCommerce sync console (PULL PRODUCTS / PULL ORDERS / PUSH PRODUCTS, live SyncLog) — moved here from OPS HUB |

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
| **Guides** | `/w/guides` | BIBLE (every applicable guide, step reader, MARK COMPLETE) + MY TREE (pathway progress, locked nodes readable but not bankable) |
| **Kitchen** | `/w/kitchen` | Today's order items by table, allergy badges, prep totals. Auto-refresh 15s |
| **Stocktake** | `/w/stocktake` | Assigned stocktakes: count list, submit IN_PROGRESS / COMPLETED |
| **Calendar** | `/w/calendar` | My upcoming shifts + request/cancel time off |
| **Floor Plan** | `/w/floorplan` | Read-only plan: zoom/pan, setup switcher, event-mode banner |
| **Notices** | `/w/notices` | Announcements with GOT IT acknowledgement |
| **Timeclock** | `/w/timeclock` | Clock in/out, breaks (NZ rules), today's hours, history |

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

| URL | Status | Notes |
|---|---|---|
| `/admin/departments` | real page, not in sidebar | Departments managed inside other pages |
| `/admin/sections` | real page, not in sidebar | Sections + positions used by staff/task forms |
| `/api/public/*` | API only | Public booking widget + availability + config |
| `/api/webhooks/woocommerce` | API only | WooCommerce webhook receiver |
| `/api/cron/*` | API only | External scheduler fallback (bearer-token) |

---

## 6. FLOW NOTES FOR RE-ORGANISATION

- **Venue switching is global** — the sidebar switcher drives every page (cookie `admin-active-venue`).
- **Every hub's tabs live in one file**: `apps/web/lib/hub-tabs.ts` (`OPS_TABS`, `TEAM_TABS`, `EXECUTION_TABS`, `TRAINING_TABS`, `SETTINGS_TABS`) — labels, order and sub-tabs are one array each.
- **The sidebar structure lives in one place**: `NAV_GROUPS` in `apps/web/components/admin/AdminNav.tsx`.
- **Drawers**: `components/ui/Drawer.tsx` (right slide-over) + `components/admin/CustomerDrawer.tsx` (contact + booking history) — used from Bookings, Orders, Customers.
- Worker app and admin panel share no navigation code — worker menu is per-page hamburger.
